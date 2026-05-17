import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { nanoid } from 'nanoid';
import { getAwsCredentials } from './credentials';
import { getSession } from './cognito';
import type { MeetingRecord, MeetingSummary, TranscriptSegment } from '@shared/types';

// Read lazily — dotenv loads after these module imports (ES imports are hoisted).
const getRegion = () => process.env.AWS_REGION || 'us-east-2';
const getTable  = () => process.env.DYNAMODB_TABLE || 'Meetly';

let doc: DynamoDBDocumentClient | null = null;

async function getDoc(): Promise<DynamoDBDocumentClient> {
  if (doc) return doc;
  const credentials = await getAwsCredentials();
  const base = new DynamoDBClient({ region: getRegion(), credentials });
  doc = DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
  });
  return doc;
}

async function userId(): Promise<string> {
  const s = await getSession();
  if (!s) throw new Error('Not signed in');
  return s.userId;
}

// =====================================================
// Single-table layout
//   PK = USER#<sub>
//   SK = MEETING#<ts>#<id>            -> MeetingRecord
//   SK = MEETING#<id>#TRANSCRIPT       -> full transcript chunked
//   SK = MEETING#<id>#SUMMARY          -> summary
//   GSI1: PK = USER#<sub>, SK = MEETING#<startedAt desc>  for list
// Transcript is chunked into segments of ~200 to avoid 400KB item limit.
// =====================================================

const TRANSCRIPT_CHUNK_SIZE = 150;

export async function createMeeting(input: { title: string }): Promise<MeetingRecord> {
  const id = nanoid(12);
  const uid = await userId();
  const now = Date.now();
  const record: MeetingRecord = {
    id,
    userId: uid,
    title: input.title || 'Untitled meeting',
    startedAt: now,
    status: 'recording',
    hasTranscript: false,
    hasSummary: false,
  };

  const c = await getDoc();
  await c.send(new PutCommand({
    TableName: getTable(),
    Item: {
      PK: `USER#${uid}`,
      SK: `MEETING#${String(now).padStart(13, '0')}#${id}`,
      Type: 'Meeting',
      ...record,
    },
  }));
  return record;
}

export async function listMeetings(): Promise<MeetingRecord[]> {
  const uid = await userId();
  const c = await getDoc();
  const res = await c.send(new QueryCommand({
    TableName: getTable(),
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${uid}`, ':sk': 'MEETING#', ':t': 'Meeting' },
    ScanIndexForward: false,
    Limit: 200,
    FilterExpression: '#t = :t',
    ExpressionAttributeNames: { '#t': 'Type' },
  }));
  return (res.Items || []).map((i) => stripKeys(i as Record<string, unknown>) as unknown as MeetingRecord);
}

export async function getMeeting(id: string): Promise<MeetingRecord | null> {
  // We don't know startedAt, so we query by id within user partition
  const uid = await userId();
  const c = await getDoc();
  const res = await c.send(new QueryCommand({
    TableName: getTable(),
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${uid}`, ':sk': 'MEETING#', ':t': 'Meeting', ':id': id },
    FilterExpression: '#t = :t AND id = :id',
    ExpressionAttributeNames: { '#t': 'Type' },
    Limit: 1,
  }));
  const item = res.Items?.find((i) => i.id === id);
  return item ? (stripKeys(item as Record<string, unknown>) as unknown as MeetingRecord) : null;
}

export async function updateMeeting(m: Partial<MeetingRecord> & { id: string }): Promise<void> {
  const existing = await getMeeting(m.id);
  if (!existing) throw new Error('Meeting not found');
  const merged: MeetingRecord = { ...existing, ...m };
  const uid = await userId();
  const c = await getDoc();
  await c.send(new PutCommand({
    TableName: getTable(),
    Item: {
      PK: `USER#${uid}`,
      SK: `MEETING#${String(merged.startedAt).padStart(13, '0')}#${merged.id}`,
      Type: 'Meeting',
      ...merged,
    },
  }));
}

export async function deleteMeeting(id: string): Promise<void> {
  const uid = await userId();
  const c = await getDoc();
  // Collect all rows for this meeting: the main record, transcript chunks, summary.
  // Transcript/summary share SK prefix MEETING#<id>#; the main meeting record sorts
  // under MEETING#<startedAt>#<id>, so do two queries and merge.
  const [byId, byPrefix] = await Promise.all([
    c.send(new QueryCommand({
      TableName: getTable(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${uid}`, ':sk': 'MEETING#', ':id': id },
      FilterExpression: 'id = :id',
    })),
    c.send(new QueryCommand({
      TableName: getTable(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${uid}`, ':sk': `MEETING#${id}#` },
    })),
  ]);
  const items = [...(byId.Items || []), ...(byPrefix.Items || [])];
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    await c.send(new BatchWriteCommand({
      RequestItems: {
        [getTable()]: batch.map((it) => ({ DeleteRequest: { Key: { PK: it.PK, SK: it.SK } } })),
      },
    }));
  }
}

export async function saveTranscript(meetingId: string, segments: TranscriptSegment[]): Promise<void> {
  const uid = await userId();
  const c = await getDoc();
  // Chunk segments
  for (let i = 0; i < segments.length; i += TRANSCRIPT_CHUNK_SIZE) {
    const chunkIndex = Math.floor(i / TRANSCRIPT_CHUNK_SIZE);
    const slice = segments.slice(i, i + TRANSCRIPT_CHUNK_SIZE);
    await c.send(new PutCommand({
      TableName: getTable(),
      Item: {
        PK: `USER#${uid}`,
        SK: `MEETING#${meetingId}#TRANSCRIPT#${String(chunkIndex).padStart(5, '0')}`,
        Type: 'TranscriptChunk',
        meetingId,
        chunkIndex,
        segments: slice,
      },
    }));
  }
  await updateMeeting({ id: meetingId, hasTranscript: true });
}

export async function loadTranscript(meetingId: string): Promise<TranscriptSegment[]> {
  const uid = await userId();
  const c = await getDoc();
  const res = await c.send(new QueryCommand({
    TableName: getTable(),
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${uid}`, ':sk': `MEETING#${meetingId}#TRANSCRIPT#` },
  }));
  return (res.Items || [])
    .sort((a, b) => (a.chunkIndex as number) - (b.chunkIndex as number))
    .flatMap((i) => (i.segments as TranscriptSegment[]) || []);
}

export async function saveSummary(meetingId: string, summary: MeetingSummary): Promise<void> {
  const uid = await userId();
  const c = await getDoc();
  await c.send(new PutCommand({
    TableName: getTable(),
    Item: {
      PK: `USER#${uid}`,
      SK: `MEETING#${meetingId}#SUMMARY`,
      Type: 'Summary',
      ...summary,
      meetingId,
    },
  }));
  await updateMeeting({ id: meetingId, hasSummary: true });
}

export async function loadSummary(meetingId: string): Promise<MeetingSummary | null> {
  const uid = await userId();
  const c = await getDoc();
  const res = await c.send(new GetCommand({
    TableName: getTable(),
    Key: { PK: `USER#${uid}`, SK: `MEETING#${meetingId}#SUMMARY` },
  }));
  if (!res.Item) return null;
  return stripKeys(res.Item as Record<string, unknown>) as unknown as MeetingSummary;
}

function stripKeys<T extends Record<string, unknown>>(item: T): Omit<T, 'PK' | 'SK' | 'Type'> {
  const { PK, SK, Type, ...rest } = item;
  return rest as Omit<T, 'PK' | 'SK' | 'Type'>;
}
