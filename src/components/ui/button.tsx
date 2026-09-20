import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "turi-tap inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /*
         * Die Haupthandlung: helle Markenflaeche, blaue Schrift, blaue
         * Haarlinie -- KEIN gefuellter, satter Knopf.
         *
         * Vorher war das erst ein schwarzer, dann ein voll blauer
         * Block. Beide Male dasselbe Problem: Die App ist hell und
         * kuehl, und ein grosser gesaettigter Flaeck darin zieht alle
         * Aufmerksamkeit auf sich, obwohl er nur ein Knopf ist. Satte
         * Toene bleiben jetzt den Kartenpins und dem Merken-Zeichen
         * vorbehalten.
         *
         * Die Haarlinie ist nicht Zierde: Die helle Flaeche allein
         * unterscheidet sich kaum vom weissen Untergrund (1.2:1), der
         * Rand macht daraus wieder einen erkennbaren Knopf -- genau das
         * verlangt WCAG 1.4.11 fuer Bedienelemente.
         */
        default: "border border-brand/40 bg-brand-soft text-brand hover:bg-brand-soft/70",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        /*
         * Haarlinie auch hier, aus demselben Grund wie oben: Das Grau
         * der Sekundaerknoepfe steht auf dem Seitengrund bei 1.05:1 --
         * praktisch dieselbe Flaeche. Ohne Rand sahen sie dort aus wie
         * deaktiviert; mit Rand sind es Knoepfe.
         */
        secondary:
          "border border-border bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
