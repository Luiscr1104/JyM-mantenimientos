import * as React from "react"
import { motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Star } from "lucide-react"

const testimonials = [
    {
        name: "Carlos Mendoza",
        role: "Dueño de Residencia",
        content: "Excelente servicio. Mi piscina nunca había estado tan limpia. Son muy puntuales y profesionales.",
    },
    {
        name: "Laura García",
        role: "Administradora de Condominio",
        content: "Llevamos un año trabajando con JyM mantenimientos y la diferencia es notable. Muy recomendados para mantenimiento a gran escala.",
    },
    {
        name: "Andrés Rivera",
        role: "Propietario de Airbnb",
        content: "Vital para mi negocio. Mis huéspedes siempre comentan lo bien que está la piscina en las reseñas.",
    },
]

export default function Testimonials() {
    return (
        <section id="testimonials" className="py-32 relative overflow-hidden">
            <div className="container mx-auto px-6 text-center relative z-10">
                <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-3xl font-bold tracking-tight sm:text-4xl mb-16"
                >
                    Lo que dicen nuestros clientes
                </motion.h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {testimonials.map((t, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.15 }}
                        >
                            <Card className="bg-muted/30 border-none h-full hover:bg-muted/50 transition-colors">
                                <CardContent className="pt-8 px-8 pb-8 flex flex-col items-center">
                                    <div className="flex justify-center mb-6 text-yellow-500">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} className="h-5 w-5 fill-current" />
                                        ))}
                                    </div>
                                    <p className="italic mb-8 text-lg text-foreground/90 leading-relaxed italic">"{t.content}"</p>
                                    <div className="mt-auto">
                                        <div className="font-bold text-lg">{t.name}</div>
                                        <div className="text-sm text-primary font-semibold uppercase tracking-wider mt-1">{t.role}</div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </div>
            <div className="absolute top-1/2 left-0 -translate-y-1/2 w-32 h-32 bg-primary/5 rounded-full blur-3xl -z-10" />
            <div className="absolute top-1/2 right-0 -translate-y-1/2 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl -z-10" />
        </section>
    )
}
