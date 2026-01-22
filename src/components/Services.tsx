import * as React from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Droplet, ShieldCheck, Thermometer, Wrench } from "lucide-react"

const services = [
    {
        title: "Limpieza y Depuración",
        description: "Limpieza exhaustiva de fondo y paredes, remoción de hojas y residuos para un agua impecable.",
        icon: Droplet,
    },
    {
        title: "Balance Químico",
        description: "Análisis preciso de pH, cloro y alcalinidad para garantizar la seguridad de tu familia.",
        icon: ShieldCheck,
    },
    {
        title: "Mantenimiento Preventivo",
        description: "Revisión de bombas, filtros y sistemas de filtrado para evitar averías costosas.",
        icon: Wrench,
    },
    {
        title: "Puesta a Punto",
        description: "Preparación de la piscina para la temporada o recuperación de aguas verdes.",
        icon: Thermometer,
    },
]

export default function Services() {
    return (
        <section id="services" className="py-32">
            <div className="container mx-auto px-6">
                <div className="text-center mb-16">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl font-bold tracking-tight sm:text-5xl"
                    >
                        Nuestros Servicios
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto"
                    >
                        Ofrecemos soluciones integrales para dueños de Airbnb y casas particulares en toda la zona de San Carlos.
                    </motion.p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {services.map((service, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                        >
                            <Card className="h-full border-none shadow-xl hover:shadow-2xl transition-all hover:-translate-y-2 bg-card">
                                <CardHeader>
                                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                                        <service.icon className="h-7 w-7 text-primary" />
                                    </div>
                                    <CardTitle className="text-xl font-bold">{service.title}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <CardDescription className="text-base leading-relaxed text-muted-foreground">
                                        {service.description}
                                    </CardDescription>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}

