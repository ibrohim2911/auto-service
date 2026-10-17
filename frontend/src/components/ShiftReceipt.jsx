import React, { forwardRef } from 'react';

const formatNum = (num) => {
  return Number(num || 0).toLocaleString('uz-UZ');
};

const ShiftReceipt = forwardRef(({ shift }, ref) => {
  if (!shift) return null;
  const summary = shift.summary || shift;

  const openedDate = shift.opened_at ? new Date(shift.opened_at) : null;
  const closedDate = shift.closed_at ? new Date(shift.closed_at) : null;

  const openedStr = openedDate
    ? `${String(openedDate.getDate()).padStart(2, '0')}.${String(openedDate.getMonth() + 1).padStart(2, '0')}.${openedDate.getFullYear()} ${openedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : '-';

  const closedStr = closedDate
    ? `${String(closedDate.getDate()).padStart(2, '0')}.${String(closedDate.getMonth() + 1).padStart(2, '0')}.${closedDate.getFullYear()} ${closedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : (shift.status === 'OPEN' ? "Hali ochiq (Joriy holat)" : '-');

  const startingCash = Number(summary.starting_cash || 0);
  const expectedCash = Number(summary.expected_cash || 0);
  const actualCash = Number(summary.actual_cash || 0);
  const difference = Number(summary.difference || (actualCash - expectedCash));

  return (
    <div style={{ display: 'none' }}>
      <div
        ref={ref}
        style={{
          padding: '16px 14px',
          fontFamily: "Arial, Helvetica, sans-serif",
          width: '320px',
          color: '#000',
          backgroundColor: '#fff',
          boxSizing: 'border-box'
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <h1 style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: '900',
            letterSpacing: '0.8px',
            textTransform: 'uppercase'
          }}>
            AVTOXIZMAT
          </h1>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginTop: '4px', textTransform: 'uppercase' }}>
            SMENA HISOBOTI (Z-REPORT)
          </div>
          <div style={{ fontSize: '12px', marginTop: '2px' }}>
            Smena #{shift.id}
          </div>
        </div>

        {/* Double solid line */}
        <div style={{ borderTop: '2px solid #000', marginBottom: '3px' }} />
        <div style={{ borderTop: '2px solid #000', marginBottom: '8px' }} />

        {/* Meta Info */}
        <div style={{ fontSize: '12.5px', lineHeight: 1.5, marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Kassir:</span>
            <span style={{ fontWeight: 'bold' }}>{shift.user_name || shift.username || summary.user_name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Ochilgan:</span>
            <span>{openedStr}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Yopilgan:</span>
            <span>{closedStr}</span>
          </div>
          {summary.duration_str && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Davomiyligi:</span>
              <span>{summary.duration_str}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Holati:</span>
            <span style={{ fontWeight: 'bold' }}>{shift.status === 'OPEN' ? 'OCHIQ' : 'YOPIQ'}</span>
          </div>
        </div>

        <div style={{ borderTop: '1.5px dashed #000', margin: '8px 0' }} />

        {/* Cash Drawer Section */}
        <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '12px' }}>
            KASSA HARAKATI (NAQD PUL)
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>1. Boshlang'ich kassa:</span>
            <span style={{ fontWeight: 'bold' }}>{formatNum(startingCash)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>2. Naqd savdo tushumi:</span>
            <span>+{formatNum(summary.cash_sale_income || 0)}</span>
          </div>

          {Number(summary.other_cash_income || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>3. Boshqa naqd kirim:</span>
              <span>+{formatNum(summary.other_cash_income)}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>4. Naqd chiqimlar:</span>
            <span>-{formatNum(summary.total_cash_expense || 0)}</span>
          </div>

          <div style={{ borderTop: '1px solid #000', margin: '4px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 'bold' }}>
            <span>KUTILGAN NAQD:</span>
            <span>{formatNum(expectedCash)} so'm</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 'bold', marginTop: '2px' }}>
            <span>BOR NAQD PUL:</span>
            <span>{formatNum(actualCash)} so'm</span>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '13.5px',
            fontWeight: '900',
            marginTop: '4px',
            paddingTop: '2px',
            borderTop: '1px solid #000'
          }}>
            <span>FARQ (RASNITSA):</span>
            <span>
              {difference > 0 ? `+${formatNum(difference)}` : formatNum(difference)} so'm
            </span>
          </div>
          <div style={{ fontSize: '11px', textAlign: 'right', fontStyle: 'italic', marginBottom: '6px' }}>
            {difference === 0 ? "(Farq yo'q - kassa to'g'ri)" : difference > 0 ? "(Ortiqcha pul)" : "(Kamomad)"}
          </div>
        </div>

        <div style={{ borderTop: '1.5px dashed #000', margin: '8px 0' }} />

        {/* Non-cash & General stats */}
        <div style={{ fontSize: '12.5px', lineHeight: 1.5 }}>
          <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '12px' }}>
            TO'LOV TURLARI VA SAVDO
          </div>

          {summary.payment_methods_summary && Object.keys(summary.payment_methods_summary).length > 0 && (
            Object.entries(summary.payment_methods_summary).map(([method, amt]) => (
              <div key={method} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ textTransform: 'capitalize' }}>{method}:</span>
                <span>{formatNum(amt)} so'm</span>
              </div>
            ))
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span>Savdolar soni:</span>
            <span style={{ fontWeight: 'bold' }}>{summary.sales_count || 0} ta</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Umumiy savdo summasi:</span>
            <span style={{ fontWeight: 'bold' }}>{formatNum(summary.total_sales_amount || 0)} so'm</span>
          </div>
        </div>

        {/* Notes if any */}
        {(shift.notes || summary.notes) && (
          <>
            <div style={{ borderTop: '1.5px dashed #000', margin: '8px 0' }} />
            <div style={{ fontSize: '12px' }}>
              <span style={{ fontWeight: 'bold' }}>Izoh: </span>
              <span>{shift.notes || summary.notes}</span>
            </div>
          </>
        )}

        {/* Footer & Signatures */}
        <div style={{ borderTop: '2px solid #000', marginTop: '12px', paddingTop: '8px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
            <span>Kassir: _____________</span>
            <span>Rahbar: _____________</span>
          </div>
          <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '11px', color: '#555' }}>
            Tizim orqali chop etildi: {new Date().toLocaleString('uz-UZ')}
          </div>
        </div>
      </div>
    </div>
  );
});

export default ShiftReceipt;
