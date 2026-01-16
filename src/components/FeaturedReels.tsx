import * as React from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Play, Facebook } from "lucide-react"

interface FacebookVideo {
    id: string;
    description?: string;
    permalink_url: string;
    picture: string;
}

interface FeaturedReelsProps {
    initialReels: FacebookVideo[];
}

export default function FeaturedReels({ initialReels }: FeaturedReelsProps) {
    // Use initialReels if provided, otherwise fallback to placeholders
    const displayReels = initialReels && initialReels.length > 0 ? initialReels : [
        {
            id: "1",
            description: "Limpieza Profunda",
            picture: "https://images.unsplash.com/photo-1572331165267-854da2b10ccc?q=80&w=500&auto=format&fit=crop",
            permalink_url: "https://facebook.com",
        },
        {
            id: "2",
            description: "Balance Químico",
            picture: "https://images.unsplash.com/photo-1584622781564-1d9876a13d00?q=80&w=500&auto=format&fit=crop",
            permalink_url: "https://facebook.com",
        },
        {
            id: "3",
            description: "Antes y Después",
            picture: "https://images.unsplash.com/photo-1562092663-99defc4a9930?q=80&w=500&auto=format&fit=crop",
            permalink_url: "https://facebook.com",
        },
        {
            id: "4",
            description: "Mantenimiento Airbnb",
            picture: "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=500&auto=format&fit=crop",
            permalink_url: "https://facebook.com",
        },
    ];

    return (
        <section id="reels" className="py-24 bg-background overflow-hidden relative">
            <div className="container mx-auto px-6">
                <div className="text-center mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center rounded-full border bg-primary/5 px-3 py-1 text-sm font-medium mb-4"
                    >
                        <span className="text-primary font-bold">Facebook Showcase</span>
                    </motion.div>
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-3xl font-bold tracking-tight sm:text-5xl"
                    >
                        Nuestros <span className="text-primary italic">Reels</span> en Facebook
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto"
                    >
                        Mira nuestro contenido más reciente directamente desde nuestra página de Facebook.
                    </motion.p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                    {displayReels.map((reel: any, index: number) => (
                        <motion.a
                            key={reel.id}
                            href={reel.permalink_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            whileInView={{ opacity: 1, scale: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.15, type: "spring", stiffness: 100 }}
                            className="group relative aspect-[9/16] rounded-3xl overflow-hidden bg-muted shadow-xl border-4 border-background cursor-pointer"
                        >
                            <img
                                src={reel.picture}
                                alt={reel.description || "Facebook Reel"}
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

                            {reel.description && (
                                <div className="absolute bottom-6 left-6 right-6">
                                    <p className="text-white font-bold text-sm leading-tight uppercase tracking-wider drop-shadow-md line-clamp-2">
                                        {reel.description}
                                    </p>
                                </div>
                            )}

                            <div className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center">
                                <Facebook className="h-4 w-4 text-white" />
                            </div>
                        </motion.a>
                    ))}
                </div>

                <div className="mt-16 text-center">
                    <Button variant="outline" size="lg" className="rounded-full px-12 group transition-all hover:bg-primary hover:text-white" asChild>
                        <a href="https://facebook.com/jymmantenimientos" target="_blank" rel="noopener noreferrer">
                            Ver más en Facebook
                            <Facebook className="ml-2 h-4 w-4 transition-transform group-hover:scale-110" />
                        </a>
                    </Button>
                </div>
            </div>
        </section>
    )
}
