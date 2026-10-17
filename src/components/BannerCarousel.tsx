import React, { useState, useEffect, useRef } from 'react';

export interface BannerCarouselProps {
  mode?: 'main' | 'food';
  autoInterval?: number;
  className?: string;
  altPrefix?: string;
  onAction?: (actionType: string) => void;
  images?: string[];
}

interface BannerSlide {
  id: string;
  image: string;
  fallbackUrl: string;
  title: string;
  ctaAction?: string;
}

const officialPlatformBannerSlides: BannerSlide[] = [
  { 
    id: 'official-banner-1', 
    image: '/Desain%20tanpa%20judul%20(1).png', 
    fallbackUrl: '/Desain%20tanpa%20judul%20(1).png', 
    title: 'Super-App Lokal Kecamatan Tumpang - TumpangGo' 
  },
  { 
    id: 'official-banner-2', 
    image: '/Desain%20tanpa%20judul%20(2).png', 
    fallbackUrl: '/Desain%20tanpa%20judul%20(2).png', 
    title: 'Dari Tumpang, Untuk Tumpang - Satu Aplikasi Berbagai Kebutuhan' 
  },
  { 
    id: 'official-banner-3', 
    image: '/Desain%20tanpa%20judul%20(3).png', 
    fallbackUrl: '/Desain%20tanpa%20judul%20(3).png', 
    title: 'Dari Tumpang, Untuk Tumpang - Ekosistem Digital Tumpang' 
  },
];

const mainPlatformBannerSlides = officialPlatformBannerSlides;
const foodPromoBannerSlides = officialPlatformBannerSlides;

export default function BannerCarousel({
  mode = 'main',
  autoInterval = 4000, // Moves automatically to the left every 4 seconds
  className = '',
  altPrefix = 'Banner',
  onAction,
  images
}: BannerCarouselProps) {
  const slidesToUse: BannerSlide[] = images && images.length > 0 
    ? images.map((img, idx) => ({
        id: `custom-${idx}`,
        image: img,
        fallbackUrl: img,
        title: `${altPrefix} ${idx + 1}`
      }))
    : (mode === 'food' ? foodPromoBannerSlides : mainPlatformBannerSlides);

  // Clone first and last images for smooth infinite slide loop
  const carouselSlides = [
    slidesToUse[slidesToUse.length - 1],
    ...slidesToUse,
    slidesToUse[0]
  ];

  const [slideIndex, setSlideIndex] = useState<number>(1);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(true);
  const [dragX, setDragX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const startXRef = useRef<number>(0);

  // Reset slide index when mode changes
  useEffect(() => {
    setSlideIndex(1);
    setIsTransitioning(false);
  }, [mode]);

  useEffect(() => {
    if (!isTransitioning) {
      const raf = requestAnimationFrame(() => {
        setIsTransitioning(true);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isTransitioning]);

  // Optional auto-slide effect (disabled when autoInterval <= 0)
  useEffect(() => {
    if (!autoInterval || autoInterval <= 0 || isDragging) return;
    const timer = setInterval(() => {
      setIsTransitioning(true);
      setSlideIndex(prev => prev + 1);
    }, autoInterval);
    return () => clearInterval(timer);
  }, [isDragging, autoInterval, mode]);

  const handleTransitionEnd = () => {
    if (slideIndex >= carouselSlides.length - 1) {
      setIsTransitioning(false);
      setSlideIndex(1);
    } else if (slideIndex <= 0) {
      setIsTransitioning(false);
      setSlideIndex(slidesToUse.length);
    }
  };

  const handleDragStart = (clientX: number) => {
    setIsDragging(true);
    startXRef.current = clientX;
    setDragX(0);
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging) return;
    const diff = clientX - startXRef.current;
    setDragX(diff);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragX < -40) {
      setIsTransitioning(true);
      setSlideIndex(prev => prev + 1);
    } else if (dragX > 40) {
      setIsTransitioning(true);
      setSlideIndex(prev => prev - 1);
    }
    setDragX(0);
  };

  return (
    <div 
      className={`relative w-full rounded-2xl sm:rounded-3xl overflow-hidden shadow-md group border border-slate-200/80 aspect-[1200/360] max-h-[300px] bg-slate-900 select-none touch-pan-y ${className}`}
      onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
      onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
      onTouchEnd={handleDragEnd}
      onMouseDown={(e) => handleDragStart(e.clientX)}
      onMouseMove={(e) => handleDragMove(e.clientX)}
      onMouseUp={handleDragEnd}
      onMouseLeave={() => { if (isDragging) handleDragEnd(); }}
    >
      {/* Track */}
      <div 
        className={`flex w-full h-full ${isDragging || !isTransitioning ? '' : 'transition-transform duration-700 ease-out'}`}
        style={{ transform: `translateX(calc(-${Math.max(0, Math.min(slideIndex, carouselSlides.length - 1)) * 100}% + ${dragX}px))` }}
        onTransitionEnd={handleTransitionEnd}
      >
        {carouselSlides.map((slide, idx) => {
          return (
            <div 
              key={`${slide.id}-${idx}`} 
              className="w-full h-full shrink-0 relative bg-slate-950 cursor-grab active:cursor-grabbing"
              onClick={() => {
                if (slide.ctaAction && onAction && Math.abs(dragX) < 5) {
                  onAction(slide.ctaAction);
                }
              }}
            >
              <img
                src={slide.image}
                alt={slide.title}
                className="w-full h-full object-cover pointer-events-none select-none"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (slide.fallbackUrl && !target.src.endsWith(slide.fallbackUrl)) {
                    target.src = slide.fallbackUrl;
                  }
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
