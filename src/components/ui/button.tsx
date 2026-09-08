import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva("button", {
  variants: { variant: { default: "button-primary", secondary: "button-secondary" } },
  defaultVariants: { variant: "default" },
});

export function Button({ className, variant, ...props }: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
