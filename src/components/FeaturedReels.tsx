import * as React from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Play } from "lucide-react"

const reels = [
    {
        id: 1,
        title: "Limpieza Profunda",
        thumbnail: "https://images.unsplash.com/photo-1572331165267-854da2b10ccc?q=80&w=500&auto=format&fit=crop",
        videoUrl: "#", // Placeholder for actual reel URL
    },
    {
        id: 2,
        title: "Balance Químico",
        thumbnail: "https://images.unsplash.com/photo-1584622781564-1d9876a13d00?q=80&w=500&auto=format&fit=crop",
        videoUrl: "#",
    },
    {
        id: 3,
        title: "Antes y Después",
        thumbnail: "https://images.unsplash.com/photo-1562092663-99defc4a9930?q=80&w=500&auto=format&fit=crop",
        videoUrl: "#",
    },
    {
        id: 4,
        title: "Mantenimiento Airbnb",
        thumbnail: "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=500&auto=format&fit=crop",
        videoUrl: "#",
    },
]

export default function FeaturedReels() {
    return (
        <section id="reels" className="py-24 bg-background overflow-hidden">
            <div className="container mx-auto px-6">
                <div className="text-center mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center rounded-full border bg-primary/5 px-3 py-1 text-sm font-medium mb-4"
                    >
                        <span className="text-primary font-bold">Video Showcase</span>
                    </motion.div>
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-3xl font-bold tracking-tight sm:text-5xl"
                    >
                        Nuestros <span className="text-primary italic">Reels</span> Destacados
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto"
                    >
                        Mira nuestro trabajo en acción. Resultados reales para clientes reales en La Fortuna.
                    </motion.p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                    {reels.map((reel, index) => (
                        <motion.div
                            key={reel.id}
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            whileInView={{ opacity: 1, scale: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.15, type: "spring", stiffness: 100 }}
                            className="group relative aspect-[9/16] rounded-3xl overflow-hidden bg-muted shadow-xl border-4 border-background cursor-pointer"
                        >
                            <img
                                src={reel.thumbnail}
                                alt={reel.title}
                                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-80" />

                            <div className="absolute inset-0 flex items-center justify-center">
                                <motion.div
                                    whileHover={{ scale: 1.2 }}
                                    whileTap={{ scale: 0.9 }}
                                    className="h-14 w-14 rounded-full bg-primary/90 text-white flex items-center justify-center shadow-2xl backdrop-blur-sm"
                                >
                                    <Play className="h-6 w-6 ml-1 fill-current" />
                                </motion.div>
                            </div>

                            <div className="absolute bottom-6 left-6 right-6">
                                <p className="text-white font-bold text-lg leading-tight uppercase tracking-wider drop-shadow-md">
                                    {reel.title}
                                </p>
                            </div>

                            <div className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                            </div>
                        </motion.div>
                    ))}
                </div>

                <div className="mt-16 text-center">
                    <Button variant="outline" size="lg" className="rounded-full px-12 group transition-all hover:bg-primary hover:text-white">
                        Ver más en Instagram
                        <Play className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                </div>
            </div>
        </section>
    )
}
