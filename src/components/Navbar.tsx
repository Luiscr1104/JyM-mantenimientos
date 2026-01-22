import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"

export default function Navbar() {
    const [isOpen, setIsOpen] = React.useState(false)

    const navLinks = [
        { href: "#services", label: "Servicios" },
        { href: "#plans", label: "Planes" },
        { href: "/blog", label: "Blog" },
        { href: "#about", label: "Nosotros" },
        { href: "#testimonials", label: "Testimonios" },
        { href: "#contact", label: "Contacto" },
    ]

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-4 md:px-8 lg:px-12 flex h-20 items-center justify-between">
                {/* Left: Logo */}
                <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <img src="/logoJyM.png" alt="JyM Logo" className="h-12 w-12 md:h-16 md:w-16 object-contain" />
                    <span className="text-lg md:text-xl font-bold tracking-tight whitespace-nowrap">JyM mantenimientos</span>
                </a>

                {/* Center: Desktop Navigation */}
                <nav className="hidden md:flex flex-1 items-center justify-center gap-4 lg:gap-8 text-sm font-semibold">
                    {navLinks.map((link) => (
                        <a key={link.href} href={link.href} className="transition-colors hover:text-primary relative group">
                            {link.label}
                            <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all group-hover:w-full"></span>
                        </a>
                    ))}
                </nav>

                {/* Right: CTA & Mobile Toggle */}
                <div className="flex flex-1 items-center justify-end gap-2 md:gap-4">
                    <div className="hidden md:block">
                        <Button variant="default" size="sm" className="rounded-full px-6 transition-all hover:scale-105 active:scale-95" asChild>
                            <a href="#contact">Solicitar Presupuesto</a>
                        </Button>
                    </div>

                    <button
                        className="md:hidden p-2 text-foreground"
                        onClick={() => setIsOpen(!isOpen)}
                        aria-label="Toggle Menu"
                    >
                        {isOpen ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden bg-background border-b overflow-hidden"
                    >
                        <div className="flex flex-col p-6 space-y-4">
                            {navLinks.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    className="text-lg font-semibold hover:text-primary transition-colors"
                                    onClick={() => setIsOpen(false)}
                                >
                                    {link.label}
                                </a>
                            ))}
                            <Button variant="default" className="w-full rounded-xl h-12" asChild onClick={() => setIsOpen(false)}>
                                <a href="#contact">Solicitar Presupuesto</a>
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    )
}
