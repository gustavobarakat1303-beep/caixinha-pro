"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { cn } from "@/lib/utils"

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />
}

function TooltipTrigger({
  children,
  asChild,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger> & { asChild?: boolean }) {
  if (asChild) {
    return (
      <TooltipPrimitive.Trigger
        data-slot="tooltip-trigger"
        {...props}
        render={(renderProps) => {
          if (React.isValidElement(children)) {
            const { asChild: _, ...clonableProps } = renderProps as any
            const childProps = children.props as any
            return React.cloneElement(children as React.ReactElement, {
              ...clonableProps,
              ...childProps,
              className: cn(clonableProps.className, childProps.className),
            } as any)
          }
          return <button {...renderProps}>{children}</button>
        }}
      />
    )
  }

  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      {...props}
    />
  )
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Popup> &
  Pick<
    React.ComponentProps<typeof TooltipPrimitive.Positioner>,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        className="z-[100]"
      >
        <TooltipPrimitive.Popup
          className={cn(
            "z-[100] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-50 shadow-2xl animate-in fade-in-0 zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
            className
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

function TooltipProvider(props: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider {...props} />
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
