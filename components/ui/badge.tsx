import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-sm px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-base-2 text-muted",
        secondary: "bg-base-2 text-muted",
        success: "bg-green-50 text-green-800",
        destructive: "bg-red-50 text-red-800",
        warning: "bg-amber-50 text-amber-800",
        gold: "bg-gold-bg text-gold-deep border border-gold-border",
        outline: "border border-border text-ink",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
