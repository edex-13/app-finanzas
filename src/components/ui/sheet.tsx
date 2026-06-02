import * as React from 'react'
import { Drawer } from 'vaul'
import { cn } from '@/lib/utils'

/**
 * Bottom sheet con gestos (swipe-to-dismiss) basado en Vaul.
 * Pensado para móvil; en escritorio se sigue viendo bien anclado abajo.
 */
export const Sheet = Drawer.Root
export const SheetTrigger = Drawer.Trigger
export const SheetClose = Drawer.Close
export const SheetPortal = Drawer.Portal

export function SheetContent({
  className,
  children,
  showHandle = true,
  ...props
}: React.ComponentProps<typeof Drawer.Content> & { showHandle?: boolean }) {
  return (
    <SheetPortal>
      <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
      <Drawer.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[92vh] flex-col rounded-t-[1.75rem] border-t border-border bg-card outline-none',
          'shadow-[0_-12px_40px_-12px_hsl(250_60%_20%_/_0.35)]',
          className,
        )}
        {...props}
      >
        {showHandle && (
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />
        )}
        <div className="safe-px flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
          {children}
        </div>
      </Drawer.Content>
    </SheetPortal>
  )
}

export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mb-4 flex flex-col gap-1 text-left', className)}
      {...props}
    />
  )
}

export function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof Drawer.Title>) {
  return (
    <Drawer.Title
      className={cn('text-lg font-semibold tracking-tight', className)}
      {...props}
    />
  )
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof Drawer.Description>) {
  return (
    <Drawer.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}
