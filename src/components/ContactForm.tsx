import * as React from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Phone, Mail, MapPin, CheckCircle2 } from "lucide-react"

export default function ContactForm() {
    const [isSubmitted, setIsSubmitted] = React.useState(false)

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitted(true)
    }

    return (
        <section id="contact" className="py-32 bg-muted/40 overflow-hidden">
            <div className="container mx-auto px-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
                            Solicita tu Cotización <span className="text-primary italic">Gratis</span>
                        </h2>
                        <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
                            Déjanos tus datos y nos pondremos en contacto contigo en menos de 24 horas para darte un presupuesto personalizado sin compromiso.
                        </p>
                        <div className="mt-12 space-y-8">
                            {[
                                { icon: Phone, label: "Teléfono / WhatsApp", value: "+506 71029497" },
                                { icon: Mail, label: "Email", value: "jymmantenimientoscr@gmail.com" },
                                { icon: MapPin, label: "Área de Cobertura", value: "La Fortuna de San Carlos" }
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-6">
                                    <div className="h-14 w-14 rounded-2xl bg-card border shadow-sm flex items-center justify-center shrink-0">
                                        <item.icon className="h-6 w-6 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold uppercase tracking-widest text-primary/70">{item.label}</p>
                                        <p className="text-xl font-bold mt-1">{item.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <Card className="shadow-2xl border-none ring-1 ring-black/5 rounded-[2rem] overflow-hidden">
                            <CardHeader className="bg-primary text-primary-foreground p-8">
                                <CardTitle className="text-2xl font-bold">Inicia hoy mismo</CardTitle>
                                <CardDescription className="text-primary-foreground/80 mt-2">
                                    Completa el formulario y te escribiremos pronto.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-8">
                                {isSubmitted ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="text-center py-12"
                                    >
                                        <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                                            <CheckCircle2 className="h-10 w-10 text-green-600" />
                                        </div>
                                        <h3 className="text-3xl font-black">¡Recibido!</h3>
                                        <p className="text-muted-foreground mt-4 text-lg">
                                            Gracias por confiar en nosotros. Un experto te contactará en breve.
                                        </p>
                                        <Button variant="outline" className="mt-8 rounded-full px-8" onClick={() => setIsSubmitted(false)}>
                                            Volver al formulario
                                        </Button>
                                    </motion.div>
                                ) : (
                                    <form className="space-y-6" onSubmit={handleSubmit}>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label htmlFor="name" className="text-sm font-bold">Nombre Completo</Label>
                                                <Input id="name" placeholder="Ej. Juan Pérez" className="rounded-xl h-12" required />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="email" className="text-sm font-bold">Email</Label>
                                                <Input id="email" type="email" placeholder="hola@ejemplo.com" className="rounded-xl h-12" required />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="phone" className="text-sm font-bold">Número de Teléfono</Label>
                                            <Input id="phone" placeholder="+506 7102-9497" className="rounded-xl h-12" required />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="message" className="text-sm font-bold">¿Cómo podemos ayudarte?</Label>
                                            <textarea
                                                id="message"
                                                className="flex min-h-[120px] w-full rounded-xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all focus:border-primary"
                                                placeholder="Ej. Mi piscina necesita una limpieza profunda urgente..."
                                                required
                                            ></textarea>
                                        </div>
                                        <Button type="submit" className="w-full h-14 text-lg font-bold rounded-xl shadow-lg shadow-primary/30 hover:scale-[1.02] transition-transform">
                                            Enviar Mensaje
                                        </Button>
                                    </form>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            </div>
        </section>
    )
}
