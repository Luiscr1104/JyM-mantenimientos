import * as React from "react"


export default function Footer() {
    return (
        <footer className="border-t bg-background py-12">
            <div className="container mx-auto px-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center md:text-left">
                    <div>
                        <div className="flex items-center justify-center md:justify-start gap-2 mb-4">
                            <img src="/logoJyM.png" alt="JyM Logo" className="h-12 w-12 object-contain" />
                            <span className="text-xl font-bold">JyM mantenimientos</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Mantenimiento profesional de piscinas. Calidad, confianza y profesionalismo en cada visita.
                        </p>
                    </div>
                    <div>
                        <h3 className="font-bold mb-4">Enlaces</h3>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><a href="#services" className="hover:text-primary transition-colors">Servicios</a></li>
                            <li><a href="#about" className="hover:text-primary transition-colors">Nosotros</a></li>
                            <li><a href="#testimonials" className="hover:text-primary transition-colors">Testimonios</a></li>
                            <li><a href="#contact" className="hover:text-primary transition-colors">Contacto</a></li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="font-bold mb-4">Contacto</h3>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li>Tel: +506 7102-9497</li>
                            <li>Email: jymmantenimientoscr@gmail.com</li>
                            <li>La Fortuna de San Carlos</li>
                        </ul>
                    </div>
                </div>
                <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
                    © {new Date().getFullYear()} JyM mantenimientos. Todos los derechos reservados.
                </div>
            </div>
        </footer>
    )
}
