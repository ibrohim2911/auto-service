import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

export default function StatHelpTooltip({ title, meaning, formula, placement = 'bottom', align = 'auto' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [effectiveAlign, setEffectiveAlign] = useState(align === 'right' ? 'right' : 'left');
  const [effectivePlacement, setEffectivePlacement] = useState(placement);
  const containerRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const showPopover = isOpen || isHovered;

  // Viewport boundary collision detection
  useEffect(() => {
    if (showPopover && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const popoverWidth = 300;

      if (align === 'right') {
        setEffectiveAlign('right');
      } else if (align === 'left') {
        setEffectiveAlign('left');
      } else {
        // Auto: if button is within popoverWidth + 24px of viewport right edge, align right!
        if (window.innerWidth - rect.left < popoverWidth + 24) {
          setEffectiveAlign('right');
        } else {
          setEffectiveAlign('left');
        }
      }

      // Check vertical collision (if bottom placement has not enough room, flip to top)
      if (placement === 'bottom') {
        if (window.innerHeight - rect.bottom < 200 && rect.top > 200) {
          setEffectivePlacement('top');
        } else {
          setEffectivePlacement('bottom');
        }
      } else {
        setEffectivePlacement(placement);
      }
    }
  }, [showPopover, align, placement]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        aria-label={`${title} haqida ma'lumot`}
        style={{
          background: 'none',
          border: 'none',
          padding: '2px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: showPopover ? 'var(--primary)' : 'var(--text-muted)',
          opacity: showPopover ? 1 : 0.65,
          borderRadius: '50%',
          transition: 'all 0.15s ease'
        }}
        title="Ma'lumot va hisoblash formulasini ko'rish"
      >
        <HelpCircle size={15} />
      </button>

      {showPopover && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: effectivePlacement === 'bottom' ? 'calc(100% + 6px)' : 'auto',
            bottom: effectivePlacement === 'top' ? 'calc(100% + 6px)' : 'auto',
            right: effectiveAlign === 'right' ? '-8px' : 'auto',
            left: effectiveAlign === 'left' ? '-8px' : 'auto',
            zIndex: 1050,
            width: '290px',
            maxWidth: 'calc(100vw - 32px)',
            backgroundColor: 'var(--surface)',
            color: 'var(--text-main)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '12px 14px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.15)',
            fontSize: '0.8rem',
            lineHeight: 1.45,
            pointerEvents: 'auto',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
            <span style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              💡 {title}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsHovered(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: '0 2px',
                cursor: 'pointer',
                color: 'var(--text-muted)'
              }}
            >
              <X size={14} />
            </button>
          </div>

          {meaning && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>
                Ma'nosi:
              </div>
              <div style={{ color: 'var(--text-main)', fontSize: '0.78rem' }}>
                {meaning}
              </div>
            </div>
          )}

          {formula && (
            <div style={{
              backgroundColor: 'var(--surface-hover)',
              padding: '6px 8px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              marginTop: '6px'
            }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '2px' }}>
                📐 Hisoblash formulasi:
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {formula}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
