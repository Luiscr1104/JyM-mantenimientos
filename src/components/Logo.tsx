import * as React from "react"

interface LogoProps {
    className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className = "h-10 w-10" }) => {
    return (
        <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Background/Base (Optional, keeping it clean) */}

            {/* J and M stylized */}
            <path
                d="M30 25V55C30 63.2843 36.7157 70 45 70"
                stroke="currentColor"
                strokeWidth="10"
                strokeLinecap="round"
                className="text-primary"
            />
            <path
                d="M55 70V30L70 50L85 30V70"
                stroke="currentColor"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary"
            />

            {/* Wave Effect */}
            <path
                d="M5 55C25 45 35 65 55 55C75 45 85 65 105 55"
                stroke="#22D3EE"
                strokeWidth="8"
                strokeLinecap="round"
                opacity="0.9"
            />

            {/* Sparkle */}
            <path
                d="M85 15L88 22L95 25L88 28L85 35L82 28L75 25L82 22L85 15Z"
                fill="#38BDF8"
            />
        </svg>
    );
};
