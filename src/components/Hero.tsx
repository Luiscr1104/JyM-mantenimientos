import * as React from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ArrowRight, CheckCircle2 } from "lucide-react"

export default function Hero() {
    return (
        <section className="relative overflow-hidden bg-background pt-24 pb-20 sm:pt-32 sm:pb-32">
            <div className="container relative z-10 mx-auto px-6 lg:px-8">
                <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center">
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="mb-6 inline-flex items-center rounded-full border bg-primary/5 px-3 py-1 text-sm font-medium">
                            <span className="text-primary">Nuevo:</span> &nbsp; Mantenimiento Ecológico Disponible
                        </div>
                        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-foreground leading-[1.1]">
                            Tu Piscina Siempre <span className="text-primary italic">Cristalina</span> en La Fortuna
                        </h1>
                        <p className="mt-6 text-lg leading-8 text-muted-foreground max-w-xl">
                            En JyM mantenimientos nos encargamos de todo. Mantenimiento profesional, limpieza profunda y balance químico para que tú solo te preocupes de disfrutar.
                        </p>
                        <div className="mt-10 flex flex-wrap gap-4">
                            <Button size="lg" className="rounded-full px-8 shadow-lg shadow-primary/20 hover:shadow-xl transition-all gap-2">
                                Empezar Ahora <ArrowRight className="h-4 w-4" />
                            </Button>
                            <Button size="lg" variant="outline" className="rounded-full px-8">
                                Ver Servicios
                            </Button>
                        </div>
                        <ul className="mt-10 space-y-4">
                            {[
                                "Mantenimiento semanal garantizado",
                                "Químicos de alta calidad incluidos",
                                "Técnicos certificados"
                            ].map((item, i) => (
                                <motion.li
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 + (i * 0.1) }}
                                    className="flex items-center gap-3 text-sm text-foreground/80 font-medium"
                                >
                                    <CheckCircle2 className="h-5 w-5 text-primary" />
                                    {item}
                                </motion.li>
                            ))}
                        </ul>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, rotate: 2 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                        className="relative lg:ml-10"
                    >
                        <div className="aspect-[4/3] overflow-hidden rounded-[2rem] bg-muted shadow-2xl border-8 border-background">
                            <img
                                src="https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?q=80&w=2070&auto=format&fit=crop"
                                alt="Piscina de lujo con mantenimiento profesional"
                                className="h-full w-full object-cover transition-transform hover:scale-105 duration-700"
                            />
                        </div>
                        <motion.div
                            initial={{ x: 20, y: 20, opacity: 0 }}
                            animate={{ x: 0, y: 0, opacity: 1 }}
                            transition={{ delay: 0.8 }}
                            className="absolute -bottom-8 -left-8 rounded-2xl bg-card p-6 shadow-2xl border"
                        >
                            <div className="text-4xl font-black text-primary tracking-tighter">+150</div>
                            <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold mt-1">
                                Piscinas atendidas
                            </div>
                        </motion.div>
                    </motion.div>
                </div>
            </div>
            {/* Decorative background element */}
            <div className="absolute top-0 right-0 -z-10 h-full w-full opacity-20 blur-3xl overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -right-[10%] h-[50rem] w-[50rem] rounded-full bg-primary/20" />
                <div className="absolute top-[20%] -left-[10%] h-[40rem] w-[40rem] rounded-full bg-blue-400/10" />
            </div>
        </section>
    )
}
