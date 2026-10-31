import React, { forwardRef } from 'react';

const Receipt = forwardRef(({
  cart = [],
  services = [],
  total = 0,
  user = null,
  client = null,
  car = null,
  saleId = 123,
  discount = 0,
  datetime = null,
  address = "JIzzax SH. Bunyodkor mahalla mo'ljal: odvanchik",
  phone = '+998970254565',
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

  const workerNames = (services || [])
    .map(s => s.worker_name || (typeof s.worker === 'object' ? (s.worker?.first_name || s.worker?.username) : ''))
    .filter(Boolean);
  const workerDisplayStr = workerNames.length > 0 ? Array.from(new Set(workerNames)).join(', ') : '________________________';

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
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #000' }}>
              <th style={{ border: '2px solid #000', padding: '5px 2px', width: '28px', textAlign: 'center', fontWeight: 'bold' }}>No</th>
              <th style={{ border: '2px solid #000', padding: '5px 4px', textAlign: 'left', fontWeight: 'bold' }}>nomi</th>
              <th style={{ border: '2px solid #000', padding: '5px 2px', width: isWorker ? '70px' : '38px', textAlign: 'center', fontWeight: 'bold' }}>soni</th>
              {!isWorker && (
                <>
                  <th style={{ border: '2px solid #000', padding: '5px 3px', width: '58px', textAlign: 'right', fontWeight: 'bold' }}>narxi</th>
                  <th style={{ border: '2px solid #000', padding: '5px 3px', width: '64px', textAlign: 'right', fontWeight: 'bold' }}>jami</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {cart.map((item, index) => {
              const qty = item.qty || item.quantity || 1;
              const unitPrice = parseFloat(item.selling_price || item.price || (item.total && qty ? item.total / qty : 0) || 0);
              const lineTotal = item.line_total != null 
                ? Math.round(Number(item.line_total))
                : (item.total != null ? Math.round(parseFloat(item.total)) : Math.round(unitPrice * qty));

              return (
                <tr key={`item-${index}`} style={{ borderBottom: '1.5px solid #000' }}>
                  <td style={{ border: '1.5px solid #000', padding: '5px 2px', textAlign: 'center' }}>
                    {index + 1}
                  </td>
                  <td style={{ border: '1.5px solid #000', padding: '5px 4px', textAlign: 'left', wordBreak: 'break-word' }}>
                    {item.name || `Mahsulot #${item.product || index + 1}`}
                  </td>
                  <td style={{ border: '1.5px solid #000', padding: '5px 2px', textAlign: 'center' }}>
                    {qty}
                  </td>
                  {!isWorker && (
                    <>
                      <td style={{ border: '1.5px solid #000', padding: '5px 3px', textAlign: 'right' }}>
                        {Number(unitPrice.toFixed(2)).toLocaleString()}
                      </td>
                      <td style={{ border: '1.5px solid #000', padding: '5px 3px', textAlign: 'right', fontWeight: 'bold' }}>
                        {Math.round(lineTotal).toLocaleString()}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {(services || []).map((svc, sIdx) => {
              const svcPrice = parseFloat(svc.amount || 0);
              const wName = svc.worker_name ? ` (${svc.worker_name})` : '';
              return (
                <tr key={`svc-${sIdx}`} style={{ borderBottom: '1.5px solid #000' }}>
                  <td style={{ border: '1.5px solid #000', padding: '5px 2px', textAlign: 'center' }}>
                    {cart.length + sIdx + 1}
                  </td>
                  <td style={{ border: '1.5px solid #000', padding: '5px 4px', textAlign: 'left', wordBreak: 'break-word' }}>
                    [Xizmat] {svc.service_name || "Xizmat haqi"}{wName}
                  </td>
                  <td style={{ border: '1.5px solid #000', padding: '5px 2px', textAlign: 'center' }}>
                    1
                  </td>
                  {!isWorker && (
                    <>
                      <td style={{ border: '1.5px solid #000', padding: '5px 3px', textAlign: 'right' }}>
                        {svcPrice.toLocaleString()}
                      </td>
                      <td style={{ border: '1.5px solid #000', padding: '5px 3px', textAlign: 'right', fontWeight: 'bold' }}>
                        {svcPrice.toLocaleString()}
                      </td>
                    </>
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
            <div style={{ fontSize: '14px', margin: '6px 0' }}>Mas'ul usta: {workerDisplayStr}</div>
            <div style={{ fontSize: '14px', margin: '6px 0 10px 0' }}>Holati: &nbsp; [ &nbsp; ] Bajarildi &nbsp;&nbsp; [ &nbsp; ] Jarayonda</div>

            {/* Thick solid line */}
            <div style={{ borderTop: '2.5px solid #000', margin: '9px 0 9px 0' }} />
          </>
        )}

        {/* Address and Phone: Increased readability with clear wrapping at the bottom */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '14px', color: '#111', marginTop: '6px' }}>
          <div style={{ wordBreak: 'break-word' }}>manzil: {address}</div>
          <div>telefon raqam: {phone}</div>
        </div>
      </div>
    </div>
  );
});

export default Receipt;
