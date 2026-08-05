import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Tidak terautentikasi." },
        { status: 401 }
      );
    }

    if (session.role !== "ADMIN" && session.role !== "KADER") {
      return NextResponse.json(
        { success: false, error: "Akses ditolak." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date") || undefined;
    const categoryId = searchParams.get("categoryId")
      ? parseInt(searchParams.get("categoryId")!)
      : undefined;

    const where: any = {};
    if (dateParam) {
      const d = new Date(dateParam);
      d.setHours(0, 0, 0, 0);
      where.attendanceDate = d;
    }

    if (categoryId) {
      where.visitor = { categoryId };
    }

    const attendances = await prisma.attendance.findMany({
      where,
      orderBy: [{ attendanceDate: "desc" }, { attendanceTime: "desc" }],
      include: {
        visitor: {
          select: {
            fullName: true,
            nik: true,
            category: { select: { name: true } },
          },
        },
        session: {
          select: { notes: true },
        },
      },
    });

    const rows = attendances.map((att, idx) => {
      const dateObj = new Date(att.attendanceDate);
      const timeObj = new Date(att.attendanceTime);
      const formattedDate = dateObj.toLocaleDateString("id-ID", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const formattedTime = timeObj.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const kegiatan =
        att.session?.notes ||
        att.notes ||
        att.visitor?.category?.name ||
        "Kegiatan Posyandu Aster";

      return {
        Nomor: idx + 1,
        "Nama Peserta": att.visitor?.fullName || "-",
        NIK: att.visitor?.nik || "-",
        Tanggal: formattedDate,
        "Jam Absensi": formattedTime,
        "Status Kehadiran": att.status === "HADIR" ? "Hadir" : "Tidak Hadir",
        "Nama Kegiatan": kegiatan,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Set Column Widths
    worksheet["!cols"] = [
      { wch: 8 },  // Nomor
      { wch: 28 }, // Nama Peserta
      { wch: 20 }, // NIK
      { wch: 25 }, // Tanggal
      { wch: 14 }, // Jam Absensi
      { wch: 18 }, // Status Kehadiran
      { wch: 30 }, // Nama Kegiatan
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Presensi Harian");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    });

    const dateStr = dateParam || new Date().toISOString().split("T")[0];
    const filename = `Presensi_Posyandu_${dateStr}.xlsx`;

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    console.error("Export presensi error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error)?.message || "Gagal meng-export data." },
      { status: 500 }
    );
  }
}
