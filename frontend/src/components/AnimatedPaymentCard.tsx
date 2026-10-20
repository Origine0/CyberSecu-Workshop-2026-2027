import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, RotateCw, Wifi, Check, ShieldCheck, Sparkles } from 'lucide-react';

interface AnimatedPaymentCardProps {
  cardNumber: string;
  customerName: string;
  expDate: string;
  cvv: string;
  focusedField: 'number' | 'name' | 'exp' | 'cvv' | null;
  isLoading?: boolean;
  status?: 'IDLE' | 'CONFIRMED' | 'FAILED';
  isFlippedManually?: boolean;
  onToggleFlip?: () => void;
}

export const AnimatedPaymentCard: React.FC<AnimatedPaymentCardProps> = ({
  cardNumber,
  customerName,
  expDate,
  cvv,
  focusedField,
  isLoading = false,
  status = 'IDLE',
  isFlippedManually,
  onToggleFlip,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [internalFlip, setInternalFlip] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  // Controlled or uncontrolled flip:
  // Auto-flip if user focuses CVV, or if manually toggled
  const isFlipped = focusedField === 'cvv' || (isFlippedManually ?? internalFlip);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const percentX = Math.round((x / rect.width) * 100);
    const percentY = Math.round((y / rect.height) * 100);
    setMousePos({ x: percentX, y: percentY });

    // Subtle 3D tilt angles (clamp between -10 and 10 deg)
    const rotX = ((y / rect.height) - 0.5) * -14;
    const rotY = ((x / rect.width) - 0.5) * 14;
    setRotate({ x: rotX, y: rotY });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotate({ x: 0, y: 0 });
    setMousePos({ x: 50, y: 50 });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const toggleFlip = () => {
    if (onToggleFlip) {
      onToggleFlip();
    } else {
      setInternalFlip(!internalFlip);
    }
  };

  // Card brand detection
  const cleanNum = cardNumber.replace(/\D/g, '');
  const brand = cleanNum.startsWith('4') 
    ? 'VISA' 
    : cleanNum.startsWith('5') 
    ? 'MASTERCARD' 
    : cleanNum.startsWith('3') 
    ? 'AMEX' 
    : 'RESILIENCE';

  const displayCardNumber = cardNumber.trim() || '4242 •••• •••• 4242';

  return (
    <div className="flex flex-col items-center">
      {/* 3D Perspective Card Container */}
      <div 
        className="w-full max-w-[360px] aspect-[1.586/1] select-none cursor-pointer"
        style={{ perspective: '1200px' }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={toggleFlip}
      >
        <motion.div
          ref={cardRef}
          className="relative w-full h-full transition-shadow duration-300 rounded-2xl"
          animate={{
            rotateX: isHovered ? rotate.x : 0,
            rotateY: (isFlipped ? 180 : 0) + (isHovered ? rotate.y : 0),
            scale: isHovered ? 1.02 : 1,
          }}
          transition={{
            type: 'spring',
            stiffness: 260,
            damping: 24,
            mass: 0.8,
          }}
          style={{
            transformStyle: 'preserve-3d',
          }}
        >
          {/* =========================================
              FRONT OF CARD
             ========================================= */}
          <div
            className={`absolute inset-0 rounded-2xl p-6 flex flex-col justify-between overflow-hidden shadow-xl border border-white/10 ${
              status === 'CONFIRMED'
                ? 'bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950/60 ring-2 ring-emerald-500/40'
                : status === 'FAILED'
                ? 'bg-gradient-to-br from-zinc-950 via-zinc-900 to-amber-950/60 ring-2 ring-amber-500/40'
                : 'bg-gradient-to-br from-zinc-950 via-zinc-900 to-black ring-1 ring-zinc-800'
            }`}
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(0deg)',
            }}
          >
            {/* Iridescent Apple Card Sheen (tracks cursor) */}
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-300"
              style={{
                opacity: isHovered ? 0.35 : 0.15,
                background: `radial-gradient(circle 240px at ${mousePos.x}% ${mousePos.y}%, rgba(255, 255, 255, 0.45), transparent 70%)`,
              }}
            />

            {/* Subtle Metallic Brushed Texture Lines */}
            <div 
              className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"
            />

            {/* Laser Scan Beam when Loading */}
            <AnimatePresence>
              {isLoading && (
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: '200%' }}
                  exit={{ opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                  className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent pointer-events-none blur-sm transform -skew-x-12"
                />
              )}
            </AnimatePresence>

            {/* Header: Brand & Security */}
            <div className="flex justify-between items-center relative z-10">
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-wider text-sm text-zinc-100 font-sans">
                  Resilience
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700/50">
                  ALPHA
                </span>
              </div>

              <div className="flex items-center gap-2 text-zinc-400">
                <div className="flex items-center gap-1 text-[11px] font-normal tracking-tight">
                  <motion.div
                    animate={isLoading ? { scale: [1, 1.25, 1], opacity: [0.6, 1, 0.6] } : {}}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >
                    <Wifi className="w-3.5 h-3.5 rotate-90 text-zinc-400" />
                  </motion.div>
                  <span>Sans contact</span>
                </div>
                <Lock className="w-3 h-3 text-zinc-500" />
              </div>
            </div>

            {/* EMV Smart Chip */}
            <div className="flex items-center justify-between my-auto relative z-10">
              <div className="relative w-11 h-8 rounded-md bg-gradient-to-tr from-amber-300 via-amber-200 to-yellow-100 shadow-sm border border-amber-400/40 p-1 flex flex-col justify-between overflow-hidden">
                {/* Chip circuitry */}
                <div className="absolute inset-x-2 top-0 bottom-0 border-x border-amber-700/30" />
                <div className="absolute inset-y-2 left-0 right-0 border-y border-amber-700/30" />
                <div className="w-2.5 h-2.5 rounded-full border border-amber-800/25 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
                <div className="w-full h-px bg-amber-800/20" />
                <div className="w-full h-px bg-amber-800/20" />
              </div>

              {/* Status Indicator Micro-Badge on Card */}
              {isLoading ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[10px] font-mono animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Chiffrement AIOps...
                </div>
              ) : status === 'CONFIRMED' ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-medium">
                  <Check className="w-3 h-3 text-emerald-400" />
                  Validé
                </div>
              ) : null}
            </div>

            {/* Card Number */}
            <div 
              className={`relative z-10 transition-all duration-200 px-2 py-1 rounded-lg ${
                focusedField === 'number' 
                  ? 'bg-white/10 ring-1 ring-white/30 backdrop-blur-xs' 
                  : ''
              }`}
            >
              <div className="text-[17px] sm:text-[19px] tracking-[0.14em] text-zinc-100 font-mono font-medium drop-shadow-xs whitespace-nowrap overflow-hidden">
                {displayCardNumber}
              </div>
            </div>

            {/* Card Footer: Holder, Expiration, Brand Icon */}
            <div className="flex justify-between items-end text-xs relative z-10 pt-2 border-t border-zinc-800/70">
              {/* Holder Name */}
              <div 
                className={`transition-all duration-200 px-1 py-0.5 rounded ${
                  focusedField === 'name' ? 'bg-white/10 ring-1 ring-white/30' : ''
                }`}
              >
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-sans">
                  Titulaire
                </div>
                <div className="text-zinc-200 font-medium tracking-wider truncate max-w-[150px] uppercase text-[11px]">
                  {customerName || 'NOM PRENOM'}
                </div>
              </div>

              {/* Expiry Date */}
              <div 
                className={`transition-all duration-200 px-1 py-0.5 rounded text-center ${
                  focusedField === 'exp' ? 'bg-white/10 ring-1 ring-white/30' : ''
                }`}
              >
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-sans">
                  Expire fin
                </div>
                <div className="text-zinc-200 font-medium font-mono text-[11px]">
                  {expDate || 'MM/AA'}
                </div>
              </div>

              {/* Brand Logo Stamp */}
              <div className="flex items-center">
                {brand === 'MASTERCARD' ? (
                  <div className="flex items-center -space-x-2">
                    <div className="w-5 h-5 rounded-full bg-rose-500/90 shadow-sm" />
                    <div className="w-5 h-5 rounded-full bg-amber-500/90 shadow-sm" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[11px] font-bold tracking-wider italic text-zinc-300">
                    <span className="text-zinc-100">VISA</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* =========================================
              BACK OF CARD
             ========================================= */}
          <div
            className="absolute inset-0 rounded-2xl py-6 flex flex-col justify-between overflow-hidden shadow-xl border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black ring-1 ring-zinc-800"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            {/* Magnetic Stripe */}
            <div className="w-full h-10 bg-black/95 shadow-inner -mt-1 border-y border-zinc-800/60" />

            {/* Signature & CVC Area */}
            <div className="px-6 space-y-2 relative z-10">
              <div className="flex items-center justify-between text-[9px] text-zinc-400 uppercase tracking-wider">
                <span>Signature autorisée</span>
                <span>Code cryptogramme</span>
              </div>

              <div className="flex items-center gap-2.5">
                {/* White Signature Strip */}
                <div className="flex-1 h-8 bg-zinc-200/95 rounded flex items-center px-3 text-zinc-800 italic font-serif text-xs select-none border border-zinc-300 shadow-inner">
                  <span className="truncate opacity-85 font-semibold tracking-wide">{customerName || 'Antoine Martin'}</span>
                </div>

                {/* Hologram security badge */}
                <div className="w-8 h-8 rounded bg-gradient-to-tr from-zinc-300 via-emerald-200/90 to-sky-300 shadow-xs flex items-center justify-center border border-white/40 shrink-0">
                  <span className="text-[7px] font-mono font-bold text-zinc-800 tracking-tighter leading-none text-center">
                    EPSI<br/>SAFE
                  </span>
                </div>

                {/* CVC Box */}
                <div
                  className={`w-12 h-8 bg-zinc-800/90 rounded border flex items-center justify-center font-mono text-xs tracking-widest transition-all duration-200 shrink-0 ${
                    focusedField === 'cvv'
                      ? 'border-emerald-400 bg-emerald-950/40 text-emerald-200 ring-2 ring-emerald-500/30'
                      : 'border-zinc-700 text-zinc-200'
                  }`}
                >
                  {cvv ? cvv.replace(/./g, '•') : '•••'}
                </div>
              </div>
            </div>

            {/* Back Micro-Legal Text */}
            <div className="px-6 text-[8px] text-zinc-500 leading-tight space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-zinc-400">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span className="font-medium text-[9px]">Protection AIOps Active</span>
                </div>
                <div className="font-mono text-[9px] text-zinc-400">EPSI BAC+5 2026</div>
              </div>
              <p className="line-clamp-2 text-zinc-600 font-sans">
                Carte de test pour simulation de résilience autonome et bascule de secours. Ne jamais partager votre code de sécurité CVC.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Interactive Helper / Flip Button */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={toggleFlip}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-zinc-500 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200/80 transition-all font-medium cursor-pointer"
        >
          <RotateCw className="w-3 h-3 transition-transform hover:rotate-180" />
          <span>{isFlipped ? 'Voir le recto' : 'Retourner la carte'}</span>
        </button>

        <span className="text-[11px] text-zinc-400 hidden sm:inline">
          Survol interactif en 3D
        </span>
      </div>
    </div>
  );
};
