import { NextResponse } from "next/server";

export async function GET() {
  const invoiceData = {
    invoice_id: "INV-1001",
    reference: "PC-202601",
    date_issued: "2026-01-05",
    client: {
      name: "Brian",
      client_id: "CL-2025-009",
    },
    provider: {
      name: "Example Care Services Pty Ltd",
      abn: "12 345 678 901",
      contact_email: "admin@examplecareservices.au",
      contact_phone: "0412 345 678",
    },
    services: [
      {
        service_date: "2026-01-04",
        description: "Support at Home – Personal Care",
        hours: 2,
        rate_per_hour: 65.0,
        gst_applicable: true,
        line_total: 130.0,
      },
    ],
    gst_total: 13.0,
    subtotal: 130.0,
    total_amount: 143.0,
    bank_details: {
      account_name: "Example Care Services Pty Ltd",
      bsb: "123-456",
      account_number: "12345678",
    },
    notes: "Includes GST where applicable",
  };

  return NextResponse.json(invoiceData);
}
