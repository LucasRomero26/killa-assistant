import Image from "next/image";

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 28, className = "" }: LogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="KillaAssistant"
      width={size}
      height={size}
      className={`rounded-lg ${className}`}
      priority
    />
  );
}
