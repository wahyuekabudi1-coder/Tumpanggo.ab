import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  variant?: 'gold' | 'white' | 'green';
  mode?: 'icon' | 'full';
  showTagline?: boolean;
}

export default function Logo({ className = '', size = 56 }: LogoProps) {
  const logoSrc = "/logo44.png";

  return (
    <div 
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ height: size ? `${size}px` : 'auto' }}
    >
      <img
        src={logoSrc}
        alt="TumpangGo Logo"
        className="h-full w-auto object-contain max-h-full"
        style={{
          imageRendering: '-webkit-optimize-contrast',
          filter: 'contrast(108%) brightness(101%)',
          transform: 'translateZ(0)',
          WebkitBackfaceVisibility: 'hidden'
        }}
        referrerPolicy="no-referrer"
        onError={(e) => {
          const target = e.currentTarget;
          const current = target.src;
          if (current.includes('/logo44.png')) {
            target.src = '/logo22 (3).png';
          } else if (current.includes('/logo22 (3).png')) {
            target.src = '/logo.png';
          } else if (current.includes('/logo.png')) {
            target.src = '/logo.jpeg';
          } else if (current.includes('/logo.jpeg')) {
            target.src = '/logo.jpg';
          } else if (current.includes('/logo.jpg')) {
            target.src = '/logo22.png';
          }
        }}
      />
    </div>
  );
}


