import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8924A]/40 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:     "bg-[#1A1820] text-[#B8924A] hover:bg-[#0C0B0F] border border-[rgba(184,146,74,0.25)]",
        destructive: "bg-[#B91C1C] text-white hover:bg-red-700",
        outline:     "border border-[#E4DFD5] bg-white hover:bg-[#FBF7EE] text-[#1A1820]",
        ghost:       "hover:bg-[#FBF7EE] text-[#1A1820]",
        link:        "text-[#B8924A] underline-offset-4 hover:underline",
        secondary:   "bg-[#F7F6F2] text-[#1A1820] hover:bg-[#FBF7EE] border border-[#E4DFD5]",
        success:     "bg-[#166534] text-white hover:bg-green-800",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm:      "h-8 px-3 text-xs",
        lg:      "h-10 px-6",
        icon:    "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
