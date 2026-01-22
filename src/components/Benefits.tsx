import * as React from "react"
import { motion } from "framer-motion"
import { Shield, Clock, Award, Star } from "lucide-react"

const benefits = [
    {
        title: "Confianza Garantizada",
        description: "Personal uniformado, identificado y con referencias comprobables para su total tranquilidad.",
        icon: Shield,
    },
    {
        title: "Puntualidad Rigurosa",
        description: "Cumplimos con el horario acordado en cada visita. Su tiempo es valioso.",
        icon: Clock,
    },
    {
        title: "Especialistas en Airbnb",
        description: "Maximizamos las reseñas positivas de sus huéspedes con piscinas impecables en cada check-in.",
        icon: Star,
    },
    {
        title: "Expertos Certificados",
        description: "Técnicos capacitados en el manejo de químicos y sistemas en La Fortuna y San Carlos.",
        icon: Award,
    },
    {
        title: "Calidad Premium",
        description: "Utilizamos solo los mejores productos químicos del mercado para cuidar su salud y su piscina.",
        icon: Star,
    },
]

export default function Benefits() {
    return (
        <section className="py-24 overflow-hidden">
            <div className="container mx-auto px-6">
                <div className="text-center mb-16">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl font-bold tracking-tight sm:text-4xl"
                    >
                        ¿Por qué elegir JyM mantenimientos?
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto"
                    >
                        Nos diferenciamos por nuestro compromiso con la excelencia y la satisfacción del cliente.
                    </motion.p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {benefits.map((benefit, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="group p-8 rounded-2xl bg-muted/30 border border-transparent hover:border-primary/20 hover:bg-card transition-all"
                        >
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <benefit.icon className="h-6 w-6 text-primary" />
                            </div>
                            <h3 className="text-xl font-bold mb-3">{benefit.title}</h3>
                            <p className="text-muted-foreground leading-relaxed">{benefit.description}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}
