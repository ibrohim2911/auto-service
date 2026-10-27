import React, { useRef, useState } from 'react';
import { Printer, Download, X, FileText, CheckCircle2 } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';

export default function OrganizationInvoiceModal({
  isOpen,
  onClose,
  sale,
  client = null,
  car = null,
  users = [],
  clients = [],
  cars = [],
  paymentMethods = []
}) {
  const invoiceRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  const handlePrint = useReactToPrint({
    contentRef: invoiceRef,
    documentTitle: `Hisob_Faktura_Chek_${sale?.id || 'faktura'}`,
    pageStyle: `
      @page {
        size: A4 portrait;
        margin: 12mm 15mm;
      }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          background-color: #ffffff !important;
        }
      }
    `
  });

  if (!isOpen || !sale) return null;

  // Resolve Client Info
  const clientObj = client || (sale.client ? clients.find(c => c.id === sale.client) : null);
  const clientName = clientObj?.name || sale.client_name || (typeof client === 'string' ? client : '') || 'Jismoniy shaxs (Oddiy mijoz)';
  const clientPhone = clientObj?.phone_number || sale.client_phone || '-';
  const clientAccount = clientObj?.account_number || sale.client_account || '-';
  const isCompany = clientObj?.is_company || sale.client_is_company || false;

  // Resolve Car Info
  const carObj = car || (sale.car ? cars.find(c => c.id === sale.car) : null);
  const carPlate = sale.car_plate || carObj?.plate_number || (typeof car === 'string' ? car : '') || '';
  const carType = sale.car_type || carObj?.car_type || '';
  const carDisplay = carPlate ? `${carPlate}${carType ? ` (${carType})` : ''}` : '-';

  // Resolve Cashier / User Info
  const userObj = users.find(u => u.id === sale.user);
  const userName = sale.user_name || userObj?.first_name || userObj?.username || 'Kassir';

  // Resolve Payment Method
  const paymentMethodObj = paymentMethods.find(m => m.id === sale.payment_type);
  const paymentTypeName = sale.payment_type_name || paymentMethodObj?.name || 'Naqd';

  // Format Date & Time
  const saleDate = sale.datetime ? new Date(sale.datetime) : new Date();
  const dateStr = `${String(saleDate.getDate()).padStart(2, '0')}.${String(saleDate.getMonth() + 1).padStart(2, '0')}.${saleDate.getFullYear()}`;
  const timeStr = saleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  // Calculate items and totals
  const items = sale.items || [];
  const services = sale.services || [];

  const itemsTotal = items.reduce((sum, it) => {
    const q = parseFloat(it.quantity || it.qty || 1);
    const p = parseFloat(it.price || it.selling_price || 0);
    return sum + (parseFloat(it.total) || (p * q));
  }, 0);

  const servicesTotal = services.reduce((sum, svc) => sum + parseFloat(svc.amount || 0), 0);
  const subtotal = itemsTotal + servicesTotal;
  const grandTotal = parseFloat(sale.total_amount || subtotal);
  const discount = Math.max(0, subtotal - grandTotal);
  const paidAmount = parseFloat(sale.paid_amount || 0);
  const debtAmount = parseFloat(sale.debt_amount || 0);

  // PDF Export using html2canvas & jspdf
  const handleDownloadPdf = async () => {
    if (!invoiceRef.current) return;
    setIsExporting(true);
    const toastId = toast.loading("PDF hisob-faktura tayyorlanmoqda...");

    try {
      const element = invoiceRef.current;

      // Clone element to body without any scroll/overflow constraints so nothing is cut off
      const clone = element.cloneNode(true);
      clone.style.position = 'fixed';
      clone.style.left = '-9999px';
      clone.style.top = '0';
      clone.style.width = '780px';
      clone.style.minWidth = '780px';
      clone.style.maxWidth = '780px';
      clone.style.height = 'auto';
      clone.style.maxHeight = 'none';
      clone.style.overflow = 'visible';
      clone.style.zIndex = '-9999';
      clone.style.backgroundColor = '#ffffff';
      document.body.appendChild(clone);

      let canvas;
      try {
        canvas = await html2canvas(clone, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 1000,
          windowHeight: Math.max(clone.scrollHeight + 200, 1600),
          width: 780,
          height: clone.scrollHeight
        });
      } finally {
        if (clone.parentNode) {
          clone.parentNode.removeChild(clone);
        }
      }

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const printableWidth = pageWidth - (margin * 2); // 190mm
      const printableHeight = pageHeight - (margin * 2); // 277mm
      const imgHeight = (canvas.height * printableWidth) / canvas.width;

      if (imgHeight <= printableHeight) {
        pdf.addImage(imgData, 'PNG', margin, margin, printableWidth, imgHeight);
      } else {
        let heightLeft = imgHeight;
        let position = margin;

        pdf.addImage(imgData, 'PNG', margin, position, printableWidth, imgHeight);
        heightLeft -= printableHeight;

        while (heightLeft > 0) {
          position = position - pageHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', margin, position, printableWidth, imgHeight);
          heightLeft -= pageHeight;
        }
      }

      pdf.save(`Hisob_Faktura_Chek_${sale.id}.pdf`);
      toast.success("PDF muvaffaqiyatli yuklab olindi!", { id: toastId });
    } catch (err) {
      console.error("PDF yaratishda xatolik:", err);
      toast.error("PDF yaratishda xatolik yuz berdi", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        zIndex: 10000,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          maxWidth: '920px',
          width: '100%',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden'
        }}
      >
        {/* Top Action Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 20px',
            backgroundColor: '#1e293b',
            color: '#fff',
            borderBottom: '1px solid #334155'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={20} color="#38bdf8" />
            <span style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '0.3px' }}>
              Tashkilot Hisob-fakturasi / Savdo cheki (A4 PDF)
            </span>
            <span style={{
              fontSize: '0.75rem',
              backgroundColor: 'rgba(56, 189, 248, 0.2)',
              color: '#38bdf8',
              padding: '2px 8px',
              borderRadius: '6px',
              fontWeight: 600
            }}>
              #{sale.id}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: isExporting ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s ease'
              }}
            >
              <Download size={15} />
              {isExporting ? "Yuklanmoqda..." : "PDF Yuklab olish"}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                backgroundColor: '#059669',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s ease'
              }}
            >
              <Printer size={15} />
              Chop etish (A4)
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Invoice Preview Container (Scrollable) */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            backgroundColor: '#f1f5f9',
            display: 'flex',
            justifyContent: 'center'
          }}
        >
          {/* Printable Invoice Page (A4 Aspect Ratio: 760px width) */}
          <div
            ref={invoiceRef}
            style={{
              width: '100%',
              maxWidth: '780px',
              backgroundColor: '#ffffff',
              padding: '36px 38px',
              color: '#000000',
              fontFamily: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              boxSizing: 'border-box'
            }}
          >
            {/* Header: Large, Extra Bold, Centered */}
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              <h1 style={{
                margin: 0,
                fontSize: '28px',
                fontWeight: '900',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: '#000'
              }}>
                AUTO LUX SERVICE
              </h1>
              <div style={{ fontSize: '13px', color: '#444', marginTop: '4px', fontWeight: '500' }}>
                Avtomobillarga texnik xizmat ko'rsatish va ehtiyot qismlar savdosi
              </div>
            </div>

            {/* Double Solid Line (Silky smooth, symmetrical, solid black bars) */}
            <div style={{ borderTop: '3px solid #000', marginBottom: '3px' }} />
            <div style={{ borderTop: '3px solid #000', marginBottom: '14px' }} />

            {/* Document Title & Reference */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              backgroundColor: '#ffffff',
              border: '1.5px solid #000',
              padding: '10px 14px',
              marginBottom: '16px'
            }}>
              <div>
                <span style={{ fontSize: '16px', fontWeight: '900', textTransform: 'uppercase' }}>
                  HISOB-FAKTURA / TO'LOV VARAG'I
                </span>
                <span style={{ fontSize: '16px', fontWeight: '900', marginLeft: '8px' }}>
                  № {sale.id}
                </span>
              </div>
              <div style={{ fontSize: '13.5px', fontWeight: 'bold' }}>
                Sana: {dateStr} | Vaqt: {timeStr}
              </div>
            </div>

            {/* Organization & Client Information Box (2 Columns) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '14px',
              marginBottom: '18px',
              fontSize: '13.5px',
              lineHeight: '1.45'
            }}>
              {/* Sotuvchi (Seller) */}
              <div style={{
                border: '1.5px solid #000',
                padding: '10px 14px',
                backgroundColor: '#ffffff'
              }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', borderBottom: '1px solid #000', paddingBottom: '4px', marginBottom: '6px' }}>
                  SOTUVCHI:
                </div>
                <div><strong>Tashkilot:</strong> AUTO LUX SERVICE</div>
                <div style={{ wordBreak: 'break-word' }}>
                  <strong>Manzil:</strong> JIzzax SH. Bunyodkor mahalla mo'ljal: odvanchik
                </div>
                <div><strong>Telefon:</strong> +998970254565</div>
                <div><strong>Kassir:</strong> {userName}</div>
              </div>

              {/* Xaridor (Buyer / Client) */}
              <div style={{
                border: '1.5px solid #000',
                padding: '10px 14px',
                backgroundColor: '#ffffff'
              }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', borderBottom: '1px solid #000', paddingBottom: '4px', marginBottom: '6px' }}>
                  XARIDOR:
                </div>
                <div>
                  <strong>Mijoz / Tashkilot:</strong> {clientName}
                  {isCompany && <span style={{ marginLeft: '4px', fontSize: '11px', fontWeight: 'bold', color: '#0369a1' }}>(Yuridik shaxs)</span>}
                </div>
                <div><strong>Telefon raqam:</strong> {clientPhone}</div>
                {clientAccount && clientAccount !== '-' && (
                  <div><strong>Hisob raqam / INN:</strong> {clientAccount}</div>
                )}
                <div><strong>Avtomobil:</strong> {carDisplay}</div>
                <div><strong>To'lov turi:</strong> {paymentTypeName}</div>
              </div>
            </div>

            {/* Symmetrical Table with Crisp Solid Borders */}
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              border: '2px solid #000',
              fontSize: '13px',
              marginBottom: '16px'
            }}>
              <thead style={{ backgroundColor: '#ffffff' }}>
                <tr style={{ backgroundColor: '#ffffff', borderBottom: '2px solid #000' }}>
                  <th style={{ backgroundColor: '#ffffff', color: '#000000', border: '2px solid #000', borderRadius: 0, padding: '7px 4px', width: '38px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px' }}>No</th>
                  <th style={{ backgroundColor: '#ffffff', color: '#000000', border: '2px solid #000', borderRadius: 0, padding: '7px 10px', textAlign: 'left', fontWeight: 'bold', fontSize: '13px' }}>nomi (Mahsulot / Xizmat)</th>
                  <th style={{ backgroundColor: '#ffffff', color: '#000000', border: '2px solid #000', borderRadius: 0, padding: '7px 6px', width: '70px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px' }}>birligi</th>
                  <th style={{ backgroundColor: '#ffffff', color: '#000000', border: '2px solid #000', borderRadius: 0, padding: '7px 6px', width: '64px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px' }}>soni</th>
                  <th style={{ backgroundColor: '#ffffff', color: '#000000', border: '2px solid #000', borderRadius: 0, padding: '7px 8px', width: '110px', textAlign: 'right', fontWeight: 'bold', fontSize: '13px' }}>narxi (1 dona)</th>
                  <th style={{ backgroundColor: '#ffffff', color: '#000000', border: '2px solid #000', borderRadius: 0, padding: '7px 10px', width: '120px', textAlign: 'right', fontWeight: 'bold', fontSize: '13px' }}>summasi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const qty = parseFloat(item.quantity || item.qty || 1);
                  const unitPrice = parseFloat(item.price || item.selling_price || (item.total && qty ? item.total / qty : 0) || 0);
                  const lineTotal = parseFloat(item.total || (unitPrice * qty));
                  const unitName = item.unit_name || (item.product_unit?.name) || 'dona';
                  const pName = item.product_name || item.name || `Mahsulot #${item.product || idx + 1}`;

                  return (
                    <tr key={`item-${idx}`} style={{ backgroundColor: '#ffffff', borderBottom: '1.5px solid #000' }}>
                      <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000', padding: '6px 4px', textAlign: 'center' }}>
                        {idx + 1}
                      </td>
                      <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000', padding: '6px 10px', textAlign: 'left', wordBreak: 'break-word', fontWeight: '500' }}>
                        {pName}
                      </td>
                      <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000', padding: '6px 6px', textAlign: 'center' }}>
                        {unitName}
                      </td>
                      <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000', padding: '6px 6px', textAlign: 'center', fontWeight: 'bold' }}>
                        {qty}
                      </td>
                      <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000', padding: '6px 8px', textAlign: 'right' }}>
                        {unitPrice.toLocaleString()}
                      </td>
                      <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000', padding: '6px 10px', textAlign: 'right', fontWeight: 'bold' }}>
                        {lineTotal.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}

                {services.map((svc, sIdx) => {
                  const svcPrice = parseFloat(svc.amount || 0);
                  const wName = svc.worker_name ? ` (${svc.worker_name})` : '';

                  return (
                    <tr key={`svc-${sIdx}`} style={{ backgroundColor: '#ffffff', borderBottom: '1.5px solid #000' }}>
                      <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000', padding: '6px 4px', textAlign: 'center' }}>
                        {items.length + sIdx + 1}
                      </td>
                      <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000', padding: '6px 10px', textAlign: 'left', wordBreak: 'break-word', fontWeight: '500' }}>
                        [Xizmat] {svc.service_name || "Xizmat haqi"}{wName}
                      </td>
                      <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000', padding: '6px 6px', textAlign: 'center' }}>
                        xizmat
                      </td>
                      <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000', padding: '6px 6px', textAlign: 'center', fontWeight: 'bold' }}>
                        1
                      </td>
                      <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000', padding: '6px 8px', textAlign: 'right' }}>
                        {svcPrice.toLocaleString()}
                      </td>
                      <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000', padding: '6px 10px', textAlign: 'right', fontWeight: 'bold' }}>
                        {svcPrice.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}

                {items.length === 0 && services.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                      Hech qanday mahsulot yoki xizmat ko'rsatilmagan
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Totals & Summary Box (Right Aligned, Crisp Borders) */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <div style={{
                width: '320px',
                border: '2px solid #000',
                padding: '10px 14px',
                backgroundColor: '#ffffff'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', marginBottom: '5px' }}>
                  <span>Jami hisoblangan summa:</span>
                  <strong>{subtotal.toLocaleString()} so'm</strong>
                </div>

                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', marginBottom: '5px', color: '#b91c1c' }}>
                    <span>Chegirma:</span>
                    <strong>-{discount.toLocaleString()} so'm</strong>
                  </div>
                )}

                <div style={{ borderTop: '1.5px solid #000', margin: '6px 0 8px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '900', marginBottom: '6px' }}>
                  <span>JAMI TO'LOV:</span>
                  <span>{grandTotal.toLocaleString()} SO'M</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', color: '#047857', marginBottom: '4px' }}>
                  <span>To'langan summa:</span>
                  <strong>{paidAmount.toLocaleString()} so'm</strong>
                </div>

                {debtAmount > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', color: '#b91c1c', fontWeight: 'bold' }}>
                    <span>Qarz qoldig'i:</span>
                    <span>{debtAmount.toLocaleString()} so'm</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#059669', fontWeight: 'bold', marginTop: '2px' }}>
                    <CheckCircle2 size={14} /> To'liq to'langan
                  </div>
                )}
              </div>
            </div>

            {/* Thick Solid Line */}
            <div style={{ borderTop: '2.5px solid #000', margin: '14px 0 10px 0' }} />

            {/* Centered Thanks note (Exact match to receipt) */}
            <div style={{ textAlign: 'center', margin: '8px 0 16px 0', fontSize: '16px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              XARIDINGIZ UCHUN RAHMAT!
            </div>

            {/* Organization Signature & Stamp Area (Formal Business Style) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr 1.2fr',
              gap: '12px',
              alignItems: 'end',
              marginTop: '24px',
              paddingTop: '8px',
              fontSize: '12.5px'
            }}>
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: '28px' }}>Topshirdi (Sotuvchi):</div>
                <div style={{ borderBottom: '1.5px solid #000', width: '100%', marginBottom: '4px' }} />
                <div style={{ fontSize: '11px', color: '#555' }}>Imzo / Mas'ul xodim: {userName}</div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{
                  border: '1.5px dashed #666',
                  borderRadius: '50%',
                  width: '84px',
                  height: '84px',
                  margin: '0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  color: '#666',
                  fontWeight: 'bold'
                }}>
                  M.O'. / STAMP
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 'bold', marginBottom: '28px' }}>Qabul qildi (Xaridor):</div>
                <div style={{ borderBottom: '1.5px solid #000', width: '100%', marginBottom: '4px' }} />
                <div style={{ fontSize: '11px', color: '#555' }}>Imzo / F.I.Sh: {clientName}</div>
              </div>
            </div>

            {/* Bottom Address and Phone: Exact match to receipt but larger and full width */}
            <div style={{
              borderTop: '2px solid #000',
              marginTop: '22px',
              paddingTop: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '13px',
              color: '#111'
            }}>
              <span><strong>manzil:</strong> JIzzax SH. Bunyodkor mahalla mo'ljal: odvanchik</span>
              <span><strong>telefon raqam:</strong> +998970254565</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
