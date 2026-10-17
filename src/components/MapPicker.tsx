import React, { useEffect, useRef, useState } from 'react';

interface MapPickerProps {
  initialLat?: number;
  initialLng?: number;
  onLocationSelected?: (lat: number, lng: number, addressDetails?: string) => void;
  readOnly?: boolean;
  pinLabel?: string;
  markerLocations?: { lat: number; lng: number; label: string; iconType?: 'merchant' | 'customer' | 'driver' }[];
}

export default function MapPicker({
  initialLat = -7.9482,
  initialLng = 112.7612,
  onLocationSelected,
  readOnly = false,
  pinLabel = 'Lokasi Anda',
  markerLocations = []
}: MapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [centerCoord, setCenterCoord] = useState<{ lat: number; lng: number }>({ lat: initialLat, lng: initialLng });
  const [addressLoading, setAddressLoading] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState('');

  // Default coordinate for Tumpang, Malang
  const tumpangLat = -7.9482;
  const tumpangLng = 112.7612;

  // Reverse geocoding function
  const reverseGeocode = async (lat: number, lng: number) => {
    setAddressLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        headers: { 'Accept-Language': 'id' }
      });
      const data = await res.json();
      if (data && data.display_name) {
        // Clean up the address a bit
        let clean = data.display_name;
        // Keep it reasonably short
        const parts = clean.split(',');
        if (parts.length > 4) {
          clean = parts.slice(0, 4).join(',').trim();
        }
        setResolvedAddress(clean);
        return clean;
      }
    } catch (e) {
      console.error('Error reverse geocoding:', e);
    } finally {
      setAddressLoading(false);
    }
    return '';
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) {
      console.error('Leaflet is not loaded from CDN.');
      return;
    }

    // Initialize map
    const map = L.map(mapContainerRef.current, {
      zoomControl: !readOnly,
      attributionControl: false
    }).setView([initialLat, initialLng], 15);

    mapRef.current = map;

    // Load OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    // If read-only, we might just want to put static markers
    if (readOnly) {
      if (markerLocations.length > 0) {
        const bounds: any[] = [];
        markerLocations.forEach(loc => {
          // Choose marker color
          let color = '#f43f5e'; // default rose
          if (loc.iconType === 'merchant') color = '#0891b2'; // cyan
          if (loc.iconType === 'driver') color = '#10b981'; // emerald

          const svgIcon = L.divIcon({
            html: `<div class="flex flex-col items-center">
              <span class="px-2 py-0.5 bg-slate-900 text-white text-[10px] rounded shadow-md font-medium whitespace-nowrap mb-1">${loc.label}</span>
              <div class="w-4 h-4 rounded-full border-2 border-white shadow-md" style="background-color: ${color}"></div>
            </div>`,
            className: 'custom-leaflet-marker',
            iconSize: [80, 40],
            iconAnchor: [40, 40]
          });

          L.marker([loc.lat, loc.lng], { icon: svgIcon }).addTo(map);
          bounds.push([loc.lat, loc.lng]);
        });

        // Fit bounds if more than 1 marker
        if (bounds.length > 1) {
          map.fitBounds(bounds, { padding: [50, 50] });
        } else if (bounds.length === 1) {
          map.setView(bounds[0], 16);
        }
      } else {
        // Just put one default marker
        L.marker([initialLat, initialLng]).addTo(map);
      }
    } else {
      // Editable mode: "Customer memilih lokasi dengan menggeser peta. Pin berada di tengah layar sebagai penanda lokasi."
      // Listen to map move events to update the selected coordinate
      const onMove = () => {
        const center = map.getCenter();
        setCenterCoord({ lat: center.lat, lng: center.lng });
      };

      const onMoveEnd = async () => {
        const center = map.getCenter();
        const address = await reverseGeocode(center.lat, center.lng);
        onLocationSelected?.(center.lat, center.lng, address);
      };

      map.on('move', onMove);
      map.on('moveend', onMoveEnd);

      // Perform initial reverse geocode
      reverseGeocode(initialLat, initialLng).then(address => {
        onLocationSelected?.(initialLat, initialLng, address);
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [readOnly, markerLocations.length]);

  // Update map view if initialLat or initialLng changes from outside (e.g. from state change or another component)
  useEffect(() => {
    if (mapRef.current && !readOnly) {
      const center = mapRef.current.getCenter();
      const latDiff = Math.abs(center.lat - initialLat);
      const lngDiff = Math.abs(center.lng - initialLng);
      // Pan if coordinate has significantly shifted externally
      if (latDiff > 0.0001 || lngDiff > 0.0001) {
        mapRef.current.setView([initialLat, initialLng], mapRef.current.getZoom());
      }
    }
  }, [initialLat, initialLng, readOnly]);

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation && mapRef.current) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          mapRef.current.setView([latitude, longitude], 17);
        },
        (error) => {
          console.error('Error getting geolocation:', error);
          // Fallback to Tumpang center
          mapRef.current.setView([tumpangLat, tumpangLng], 15);
        }
      );
    }
  };

  return (
    <div className="relative w-full h-full min-h-[300px] border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-slate-100">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[300px]" style={{ zIndex: 1 }} />

      {/* Editable Central Pin Overlay */}
      {!readOnly && (
        <div 
          className="absolute inset-0 flex items-center justify-center pointer-events-none" 
          style={{ zIndex: 10 }}
        >
          <div className="flex flex-col items-center -translate-y-6">
            <div className="bg-slate-900 text-white text-[11px] px-2.5 py-1 rounded-full shadow-lg font-medium tracking-tight mb-1 whitespace-nowrap">
              {pinLabel}
            </div>
            {/* Animated Pin */}
            <div className="relative flex items-center justify-center">
              {/* Ripple Ring */}
              <div className="absolute w-6 h-6 bg-rose-500/30 rounded-full animate-ping scale-150"></div>
              {/* Pin Base */}
              <div className="w-4 h-4 bg-rose-600 rounded-full border-2 border-white shadow-md"></div>
              {/* Pin Needle */}
              <div className="w-1 h-5 bg-rose-600 shadow-sm -mt-2"></div>
            </div>
          </div>
        </div>
      )}

      {/* Address & Controls Card in Editable Mode */}
      {!readOnly && (
        <div 
          className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-sm p-3.5 rounded-xl shadow-lg border border-slate-100 flex flex-col gap-2 pointer-events-auto"
          style={{ zIndex: 20 }}
        >
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Geser Peta untuk Memilih Lokasi</span>
              <p className="text-sm font-semibold text-slate-800 line-clamp-2 mt-0.5">
                {addressLoading ? (
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></span>
                    Mencari alamat...
                  </span>
                ) : (
                  resolvedAddress || `${centerCoord.lat.toFixed(5)}, ${centerCoord.lng.toFixed(5)}`
                )}
              </p>
            </div>
            
            <button
              onClick={handleGetCurrentLocation}
              type="button"
              className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-rose-100 shadow-sm"
              title="Gunakan GPS Perangkat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
