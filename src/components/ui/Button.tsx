import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonStyles = cva(
  'no-drag inline-flex items-center justify-center gap-1.5 font-medium tracking-tight rounded-md transition-all duration-150 ring-focus disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:   'bg-paper-900 text-paper-50 hover:bg-paper-800 shadow-sm',
        accent:    'bg-accent-600 text-white hover:bg-accent-700 shadow-glow-accent',
        ghost:     'text-paper-700 hover:text-paper-900 hover:bg-paper-900/[0.05]',
        outline:   'border border-paper-900/10 text-paper-800 hover:bg-paper-900/[0.03] hover:border-paper-900/20',
        soft:      'bg-paper-900/[0.05] text-paper-800 hover:bg-paper-900/[0.08]',
        danger:    'bg-signal-live text-white hover:bg-signal-live/90 shadow-sm',
        icon:      'text-paper-600 hover:text-paper-900 hover:bg-paper-900/[0.05]',
      },
      size: {
        xs:  'h-6 px-2 text-[11px]',
        sm:  'h-7 px-2.5 text-xs',
        md:  'h-9 px-3.5 text-sm',
        lg:  'h-11 px-5 text-sm',
        iconSm: 'h-6 w-6 p-0',
        iconMd: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: { variant: 'soft', size: 'sm' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonStyles({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
