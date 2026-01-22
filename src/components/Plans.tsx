import * as React from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, Star } from "lucide-react"

const plans = [
    {
        name: "Mantenimiento Standard",
        description: "Ideal para piscinas con poco uso o mantenimiento básico.",
        price: "Contactar",
        visits: "1 Visita por semana",
        features: [
            "Limpieza de superficie",
            "Aspirado de fondo",
            "Limpieza de canastas",
            "Revisión de equipos",
            "Informe de visita"
        ],
        highlight: false,
        cta: "Cotizar Standard"
    },
    {
        name: "Mantenimiento Premium",
        description: "La mejor opción para Airbnbs y piscinas de alto uso.",
        price: "₡90,000",
        period: "/ mes",
        visits: "2 Visitas por semana",
        features: [
            "Todo lo del plan Standard",
            "Incluye Productos Químicos",
            "Balance químico avanzado",
            "Lavado de filtro",
            "Cepillado de paredes",
            "Atención prioritaria"
        ],
        highlight: true,
        cta: "Solicitar Premium"
    }
]

export default function Plans() {
    return (
        <section id="plans" className="py-24">
            <div className="container mx-auto px-6">
                <div className="text-center mb-16">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl font-bold tracking-tight sm:text-5xl mb-4"
                    >
                        Nuestros Planes
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-lg text-muted-foreground max-w-2xl mx-auto"
                    >
                        Elige el plan que mejor se adapte a las necesidades de tu piscina. Sin contratos forzosos.
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                    {plans.map((plan, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="flex"
                        >
                            <Card className={`flex flex-col w-full relative overflow-hidden transition-all hover:shadow-2xl ${plan.highlight
                                ? "border-primary shadow-xl scale-105 border-2"
                                : "border-border hover:-translate-y-1"
                                }`}>
                                {plan.highlight && (
                                    <div className="absolute top-0 right-0 p-4">
                                        <div className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-lg">
                                            <Star className="h-3 w-3 fill-current" />
                                            Recomendado
                                        </div>
                                    </div>
                                )}
                                <CardHeader>
                                    <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                                    <CardDescription className="text-base mt-2">
                                        {plan.description}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex-1">
                                    <div className="mb-6">
                                        <span className="text-4xl font-extrabold">{plan.price}</span>
                                        {plan.period && <span className="text-muted-foreground ml-1">{plan.period}</span>}
                                    </div>
                                    <div className="mb-6 p-3 bg-muted/50 rounded-lg font-medium text-center text-primary border border-primary/10">
                                        {plan.visits}
                                    </div>
                                    <ul className="space-y-3">
                                        {plan.features.map((feature, i) => (
                                            <li key={i} className="flex items-start gap-3">
                                                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                                    <Check className="h-3.5 w-3.5 text-primary" />
                                                </div>
                                                <span className="text-sm text-foreground/80">{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                                <CardFooter className="pt-8">
                                    <Button
                                        className={`w-full h-12 text-base ${plan.highlight ? "bg-primary hover:bg-primary/90" : ""}`}
                                        variant={plan.highlight ? "default" : "outline"}
                                        asChild
                                    >
                                        <a href="#contact">
                                            {plan.cta}
                                        </a>
                                    </Button>
                                </CardFooter>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}
