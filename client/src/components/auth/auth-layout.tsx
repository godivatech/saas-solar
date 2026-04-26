import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";

import loginBg from "@assets/login-bg.png";

interface AuthLayoutProps {
    children: ReactNode;
    title: string;
    subtitle: string;
    footer?: ReactNode;
}

export function AuthLayout({ children, title, subtitle, footer }: AuthLayoutProps) {
    const [location] = useLocation();

    return (
        <div className="min-h-screen grid lg:grid-cols-2">
            {/* Left Column - Form Container */}
            <div className="flex flex-col justify-center px-4 sm:px-6 lg:px-8 bg-background relative overflow-hidden py-10">
                {/* Subtle background decoration - Fixed positioning to preventing shifting */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none opacity-30">
                    <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[100px]" />
                    <div className="absolute top-[60%] -left-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[100px]" />
                </div>

                <div className="mx-auto w-full max-w-sm space-y-8 relative z-10">
                    <div className="flex flex-col items-center text-center space-y-2">


                        <motion.div
                            key={location + "-header"}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <h1 className="text-3xl font-bold tracking-tight text-foreground">
                                {title}
                            </h1>
                            <p className="text-sm text-muted-foreground mt-2">
                                {subtitle}
                            </p>
                        </motion.div>
                    </div>

                    <motion.div
                        key={location + "-form"}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                        className="border border-border/50 bg-card/50 backdrop-blur-sm rounded-xl p-6 shadow-sm ring-1 ring-black/5 dark:ring-white/5"
                    >
                        {children}
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="w-full flex flex-col items-center gap-4"
                    >
                        {footer}
                        <div className="text-center">
                            <a
                                href="https://godivatech.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground/60 hover:text-primary transition-colors duration-200"
                            >
                                Developed by Godivatech
                            </a>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Right Column - Image (Static) */}
            <div className="hidden lg:block relative bg-muted h-full">
                <img
                    src={loginBg}
                    alt="Solar Installation"
                    className="absolute inset-0 h-full w-full object-cover grayscale-[10%] contrast-[1.05]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10 mix-blend-multiply" />
                <div className="absolute bottom-0 left-0 right-0 p-12 text-white z-20 bg-gradient-to-t from-black/90 to-transparent pt-32">
                    <blockquote className="space-y-2 max-w-lg">
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.8 }}
                            className="text-xl font-light italic opacity-90 leading-relaxed"
                        >
                            "Empowering the future with sustainable energy solutions. Managing operations has never been more efficient."
                        </motion.p>
                        <footer className="text-sm font-medium opacity-70 tracking-wide pt-4 border-t border-white/20 inline-block mt-4">
                            Solar ERP Enterprise
                        </footer>
                        <div className="flex items-center gap-4 mt-6 opacity-60">
                            <div className="flex-1 border-t border-dashed border-white/50"></div>
                            <div className="text-xs whitespace-nowrap">Developed by Godivatech</div>
                            <div className="flex-1 border-t border-dashed border-white/50"></div>
                        </div>
                    </blockquote>
                </div>

                {/* Decorative pattern overlay */}
                <div
                    className="absolute inset-0 opacity-[0.03] z-10 pointer-events-none"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                    }}
                />
            </div>
        </div>
    );
}
