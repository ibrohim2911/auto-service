import React, { forwardRef } from 'react';

const Receipt = forwardRef(({ 
  cart = [], 
  total = 0, 
  user = null, 
  client = null, 
  car = null,
  saleId = 123, 
  discount = 0,
  datetime = null,
  address = 'asjdnasldkoaskdmkasl',
  phone = '+999999999',
  isWorker = false
}, ref) => {
  const now = datetime ? new Date(datetime) : new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

  const clientName = (typeof client === 'object' && client?.name) 
    ? client.name 
    : (typeof client === 'string' && client.trim()) 
      ? client.trim() 
      : '';

  const carPlate = (typeof car === 'object' && car?.plate_number)
    ? (car.plate_number + (car.car_type ? ` (${car.car_type})` : ''))
    : (typeof car === 'string' && car.trim())
      ? car.trim()
      : '';

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
        {/* Header: Large, Bold, Centered (+10% size) */}
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: '26px', 
            fontWeight: '900', 
            letterSpacing: '0.8px',
            textTransform: 'uppercase'
          }}>
            AUTO LUX SERVICE
          </h1>
        </div>

        {/* Double solid line */}
        <div style={{ borderTop: '2.5px solid #000', marginBottom: '3px' }} />
        <div style={{ borderTop: '2.5px solid #000', marginBottom: '8px' }} />

        {/* Time and Date (+10% size) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14.5px', fontWeight: 'bold' }}>
          <span>{timeStr}</span>
          <span>{dateStr}</span>
        </div>

        {/* Mijoz and Chek (+10% size, blank if no client) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14.5px', margin: '5px 0 9px 0' }}>
          <span>Mijoz:{clientName ? ` ${clientName}` : ''}</span>
          <span style={{ fontWeight: 'bold' }}>chek: {saleId}</span>
        </div>

        {/* Car info if present */}
        {carPlate && (
          <div style={{ fontSize: '14.5px', fontWeight: 'bold', margin: '2px 0 8px 0' }}>
            Avto: {carPlate}
          </div>
        )}

        {/* Table with Crisp Grid Borders & Symmetry (+10% size) */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', fontSize: '13.5px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #000' }}>
              <th style={{ border: '2px solid #000', padding: '5px 2px', width: '34px', textAlign: 'center', fontWeight: 'bold' }}>No</th>
              <th style={{ border: '2px solid #000', padding: '5px 6px', textAlign: 'left', fontWeight: 'bold' }}>nomi</th>
              <th style={{ border: '2px solid #000', padding: '5px 2px', width: isWorker ? '70px' : '46px', textAlign: 'center', fontWeight: 'bold' }}>soni</th>
              {!isWorker && (
                <th style={{ border: '2px solid #000', padding: '5px 6px', width: '74px', textAlign: 'right', fontWeight: 'bold' }}>narxi</th>
              )}
            </tr>
          </thead>
          <tbody>
            {cart.map((item, index) => {
              const qty = item.qty || item.quantity || 1;
              const price = parseFloat(item.selling_price || item.price || 0);
              const lineTotal = parseFloat(item.total || (price * qty));

              return (
                <tr key={index} style={{ borderBottom: '1.5px solid #000' }}>
                  <td style={{ border: '1.5px solid #000', padding: '5px 2px', textAlign: 'center' }}>
                    {index + 1}
                  </td>
                  <td style={{ border: '1.5px solid #000', padding: '5px 6px', textAlign: 'left', wordBreak: 'break-word' }}>
                    {item.name || `Mahsulot #${item.product || index + 1}`}
                  </td>
                  <td style={{ border: '1.5px solid #000', padding: '5px 2px', textAlign: 'center' }}>
                    {qty}
                  </td>
                  {!isWorker && (
                    <td style={{ border: '1.5px solid #000', padding: '5px 6px', textAlign: 'right', fontWeight: 'bold' }}>
                      {lineTotal.toLocaleString()}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {!isWorker ? (
          <>
            {/* Jami and Chegirma: Bold, Prominent (+10% size) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16.5px', fontWeight: 'bold', margin: '9px 0 7px 0' }}>
              <span>Jami: {Number(total).toLocaleString()}</span>
              <span>Chegirma: {Number(discount).toLocaleString()}</span>
            </div>

            {/* Thick solid line */}
            <div style={{ borderTop: '2.5px solid #000', margin: '7px 0 9px 0' }} />

            {/* Centered Thanks note (NOT at bottom) */}
            <div style={{ textAlign: 'center', margin: '8px 0 12px 0', fontSize: '15.5px', fontWeight: '500' }}>
              xaridingiz uchun rahmat
            </div>
          </>
        ) : (
          <>
            {/* Thick solid line */}
            <div style={{ borderTop: '2.5px solid #000', margin: '9px 0 10px 0' }} />

            {/* Worker checkoff & signature lines */}
            <div style={{ fontSize: '14px', margin: '6px 0' }}>Mas'ul usta: ________________________</div>
            <div style={{ fontSize: '14px', margin: '6px 0 10px 0' }}>Holati: &nbsp; [ &nbsp; ] Bajarildi &nbsp;&nbsp; [ &nbsp; ] Jarayonda</div>

            {/* Thick solid line */}
            <div style={{ borderTop: '2.5px solid #000', margin: '9px 0 9px 0' }} />
          </>
        )}

        {/* Address and Phone: Increased by 10% more (15.5px) - at the bottom */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15.5px', color: '#111', marginTop: '6px' }}>
          <span>mazil: {address}</span>
          <span>telefon raqam: {phone}</span>
        </div>
      </div>
    </div>
  );
});

export default Receipt;
