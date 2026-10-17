import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export default function Pagination({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100]
}) {
  if (totalItems === 0) return null;

  const from = Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const to = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers with smart windowing
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) {
        start = 2;
        end = 4;
      } else if (currentPage >= totalPages - 2) {
        start = totalPages - 3;
        end = totalPages - 1;
      }

      if (start > 2) pages.push('...');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('...');

      pages.push(totalPages);
    }
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 20px',
      borderTop: '1px solid var(--border)',
      backgroundColor: 'var(--surface)',
      flexWrap: 'wrap',
      gap: '12px',
      fontSize: '0.86rem',
      borderRadius: '0 0 14px 14px'
    }}>
      {/* Left side: Information and Page Size Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', color: 'var(--text-muted)' }}>
        <span>
          Ko'rsatilmoqda: <strong>{from.toLocaleString()} - {to.toLocaleString()}</strong> / Jami: <strong style={{ color: 'var(--text-main)' }}>{totalItems.toLocaleString()}</strong> ta
        </span>

        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.8rem' }}>Sahifada:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-color)',
                color: 'var(--text-main)',
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              {pageSizeOptions.map(sz => (
                <option key={sz} value={sz}>{sz} ta</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right side: Page Navigation Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {/* First Page button */}
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '32px', height: '32px', borderRadius: '6px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-color)',
            color: currentPage <= 1 ? 'var(--text-muted)' : 'var(--text-main)',
            opacity: currentPage <= 1 ? 0.4 : 1,
            cursor: currentPage <= 1 ? 'not-allowed' : 'pointer'
          }}
          title="Birinchi sahifa"
        >
          <ChevronsLeft size={16} />
        </button>

        {/* Previous Page button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '32px', height: '32px', borderRadius: '6px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-color)',
            color: currentPage <= 1 ? 'var(--text-muted)' : 'var(--text-main)',
            opacity: currentPage <= 1 ? 0.4 : 1,
            cursor: currentPage <= 1 ? 'not-allowed' : 'pointer'
          }}
          title="Oldingi sahifa"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Numbered Page Buttons */}
        {pages.map((p, idx) => {
          if (p === '...') {
            return (
              <span key={`dots-${idx}`} style={{ padding: '0 6px', color: 'var(--text-muted)', userSelect: 'none' }}>
                ...
              </span>
            );
          }

          const isActive = p === currentPage;
          return (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minWidth: '32px', height: '32px', padding: '0 6px', borderRadius: '6px',
                border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                backgroundColor: isActive ? 'var(--primary)' : 'var(--bg-color)',
                color: isActive ? 'white' : 'var(--text-main)',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {p}
            </button>
          );
        })}

        {/* Next Page button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '32px', height: '32px', borderRadius: '6px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-color)',
            color: currentPage >= totalPages ? 'var(--text-muted)' : 'var(--text-main)',
            opacity: currentPage >= totalPages ? 0.4 : 1,
            cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer'
          }}
          title="Keyingi sahifa"
        >
          <ChevronRight size={16} />
        </button>

        {/* Last Page button */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '32px', height: '32px', borderRadius: '6px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-color)',
            color: currentPage >= totalPages ? 'var(--text-muted)' : 'var(--text-main)',
            opacity: currentPage >= totalPages ? 0.4 : 1,
            cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer'
          }}
          title="Oxirgi sahifa"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}
