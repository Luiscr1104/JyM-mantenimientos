import * as React from "react"
import { motion } from "framer-motion"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"

const faqs = [
    {
        question: "¿Con qué frecuencia recomiendan el mantenimiento?",
        answer: "Para la mayoría de las piscinas residenciales, recomendamos una visita semanal. Esto garantiza que el balance químico se mantenga estable y la limpieza sea constante, evitando la acumulación de residuos y el crecimiento de algas.",
    },
    {
        question: "¿Qué está incluido en el servicio básico?",
        answer: "Nuestro servicio básico incluye: aspirado del fondo, limpieza de paredes y línea de flotación, retiro de hojas de la superficie, vaciado de canastas, limpieza de filtro y análisis completo de químicos con aplicación de los productos necesarios.",
    },
    {
        question: "¿Ustedes proporcionan los químicos?",
        answer: "Sí, todos nuestros planes estándar incluyen los químicos básicos necesarios para el mantenimiento regular (cloro, reguladores de pH, alguicidas). Usted no tiene que preocuparse por comprar nada.",
    },
    {
        question: "¿Qué pasa si mi piscina está verde?",
        answer: "Ofrecemos un servicio especial de 'Recuperación de Agua' en La Fortuna. Evaluamos el equipo y realizamos un tratamiento de choque intensivo.",
    },
    {
        question: "¿Ofrecen servicios específicos para Airbnb?",
        answer: "¡Absolutamente! Entendemos la dinámica de los check-ins. Coordinamos las visitas para que la piscina esté perfecta justo antes de que lleguen sus nuevos huéspedes.",
    },
]

export default function FAQ() {
    return (
        <section id="faq" className="py-24 bg-muted/30">
            <div className="container mx-auto px-6 max-w-3xl">
                <div className="text-center mb-12">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl font-bold tracking-tight sm:text-4xl"
                    >
                        Preguntas Frecuentes
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="mt-4 text-muted-foreground"
                    >
                        Resolvemos tus dudas sobre nuestro servicio de mantenimiento.
                    </motion.p>
                </div>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                >
                    <Accordion type="single" collapsible className="w-full">
                        {faqs.map((faq, index) => (
                            <AccordionItem key={index} value={`item-${index}`}>
                                <AccordionTrigger className="text-left font-semibold">{faq.question}</AccordionTrigger>
                                <AccordionContent className="text-muted-foreground leading-relaxed">
                                    {faq.answer}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </motion.div>
            </div>
        </section>
    )
}
