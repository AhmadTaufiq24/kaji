import type { Verdict } from "../scoring.js";

export type GoldenBand = "strong" | "medium" | "weak" | "edge";

export type GoldenCase = {
  id: string;
  band: GoldenBand;
  ideaText: string;
  expectedVerdicts: Verdict[];
  requiredCompetitors: string[];
  expectReject: boolean;
};

export const GOLDEN_SET: GoldenCase[] = [
  {
    id: "strong-pajak-umkm",
    band: "strong",
    ideaText:
      "Software e-faktur dan rekonsiliasi PPN untuk konsultan pajak solo yang menangani 20–80 klien UMKM. Impor CSV dari marketplace, deteksi invoice duplikat, reminder jatuh tempo. Rp 199.000/bulan. Target Jabodetabek dan Surabaya.",
    expectedVerdicts: ["Proceed", "Proceed with caution"],
    requiredCompetitors: ["Klikpajak", "Jurnal"],
    expectReject: false,
  },
  {
    id: "strong-cold-chain-ikan",
    band: "strong",
    ideaText:
      "Sensor suhu murah plus dashboard WhatsApp untuk nelayan dan pengepul ikan di pelabuhan kecil Jawa Timur agar rantai dingin tidak putus sebelum ke pasar. Sewa perangkat Rp 75.000/minggu per box. Kami pasang dan rawat.",
    expectedVerdicts: ["Proceed", "Proceed with caution", "Pivot"],
    requiredCompetitors: [],
    expectReject: false,
  },
  {
    id: "strong-bisindo-ortu",
    band: "strong",
    ideaText:
      "Aplikasi latihan Bahasa Isyarat Indonesia untuk orang tua dengar yang punya anak tuli usia 1–6 tahun. Sesi 10 menit/hari, umpan balik kamera, kurikulum bersama guru SLB. Rp 89.000/bulan. Mulai di Jakarta dan Bandung.",
    expectedVerdicts: ["Proceed", "Proceed with caution", "Pivot"],
    requiredCompetitors: [],
    expectReject: false,
  },
  {
    id: "strong-warung-stok",
    band: "strong",
    ideaText:
      "Pemilik warung kelontong foto rak lewat WhatsApp; kami hitung stok kira-kira dan usul restock ke salesman Indomarco setempat. Rp 49.000/bulan. Bukan mini-market franchise.",
    expectedVerdicts: ["Proceed", "Proceed with caution", "Pivot"],
    requiredCompetitors: [],
    expectReject: false,
  },
  {
    id: "strong-klinik-antrean",
    band: "strong",
    ideaText:
      "Antrian, rekam medis ringan, dan e-resep untuk klinik 1–3 dokter di kabupaten. Pasien dapat nomor antrean WhatsApp. Klinik bayar Rp 350.000/bulan termasuk onboarding perawat.",
    expectedVerdicts: ["Proceed", "Proceed with caution"],
    requiredCompetitors: ["Klinika", "Cloud Klinik"],
    expectReject: false,
  },
  {
    id: "medium-kos",
    band: "medium",
    ideaText:
      "Aplikasi langganan untuk pemilik kos: pengingat tagihan via WhatsApp, pencatatan pembayaran, laporan bulanan. Target pemilik kos 10–50 kamar di kota besar. Rp 99.000/bulan.",
    expectedVerdicts: ["Proceed with caution", "Pivot", "Stop"],
    requiredCompetitors: ["Mamikos", "SuperKos"],
    expectReject: false,
  },
  {
    id: "medium-hris-pabrik",
    band: "medium",
    ideaText:
      "HRIS absensi wajah dan slip gaji untuk pabrik 20–100 orang di Bekasi dan Karawang. Rp 15.000/karyawan/bulan. Integrasi BPJS kesehatan manual dulu.",
    expectedVerdicts: ["Proceed with caution", "Pivot"],
    requiredCompetitors: ["Mekari", "Talenta"],
    expectReject: false,
  },
  {
    id: "medium-skd-cpns",
    band: "medium",
    ideaText:
      "Bank soal SKD CPNS plus tryout timed dan ranking nasional. Rp 79.000 per periode pendaftaran. Target fresh graduate di kota kabupaten.",
    expectedVerdicts: ["Proceed with caution", "Pivot", "Stop"],
    requiredCompetitors: ["Bimbel"],
    expectReject: false,
  },
  {
    id: "medium-laundry",
    band: "medium",
    ideaText:
      "Pickup laundry kiloan via app di Jakarta Selatan, cuci di mitra existing, antar 24 jam. Komisi 20%. Target karyawan kos-kosan.",
    expectedVerdicts: ["Pivot", "Stop", "Proceed with caution"],
    requiredCompetitors: ["Laundry"],
    expectReject: false,
  },
  {
    id: "medium-pos-salon",
    band: "medium",
    ideaText:
      "Kasir dan booking salon kecantikan 2–6 kursi di Medan dan Palembang. Rp 129.000/bulan. Termasuk stok cat rambut.",
    expectedVerdicts: ["Proceed with caution", "Pivot"],
    requiredCompetitors: ["Olsera", "Moka"],
    expectReject: false,
  },
  {
    id: "weak-instagram-lebih-bagus",
    band: "weak",
    ideaText:
      "Saya mau bikin aplikasi seperti Instagram tapi lebih bagus, lebih cepat, dan semua orang di Indonesia pasti pakai. Monetisasi iklan. Modal saya belum ada.",
    expectedVerdicts: ["Stop", "Pivot"],
    requiredCompetitors: ["Instagram", "TikTok"],
    expectReject: false,
  },
  {
    id: "weak-vitamin-kanker",
    band: "weak",
    ideaText:
      "Jual vitamin herbal ajaib yang menyembuhkan kanker dalam 7 hari, dropship Shopee, margin 400%. Target ibu rumah tangga di seluruh Indonesia. Rp 350.000 per botol.",
    expectedVerdicts: ["Stop"],
    requiredCompetitors: [],
    expectReject: false,
  },
  {
    id: "weak-ai-urus-semua",
    band: "weak",
    ideaText:
      "Platform AI yang mengurus semua bisnis UMKM: keuangan, marketing, HR, hukum, pajak, otomatis tanpa manusia. Langganan Rp 50.000 seumur hidup.",
    expectedVerdicts: ["Stop", "Pivot"],
    requiredCompetitors: [],
    expectReject: false,
  },
  {
    id: "weak-clone-gojek",
    band: "weak",
    ideaText:
      "Saya ingin membuat Gojek versi saya sendiri dengan ojek, makanan, dan kirim barang di seluruh Indonesia, lebih murah dari Gojek. Komisi driver 5% saja.",
    expectedVerdicts: ["Stop", "Pivot"],
    requiredCompetitors: ["Gojek", "Grab"],
    expectReject: false,
  },
  {
    id: "weak-crypto-10-persen",
    band: "weak",
    ideaText:
      "Aplikasi investasi crypto yang menjamin 10% return per hari, tanpa risiko, untuk pemula. Setor via DANA. Target mahasiswa.",
    expectedVerdicts: ["Stop"],
    requiredCompetitors: [],
    expectReject: false,
  },
  {
    id: "edge-mau-bisnis",
    band: "edge",
    ideaText:
      "Halo min saya mau bisnis dong yang menguntungkan supaya cepat kaya di tahun ini tolong bikinin ide dan aplikasinya ya terima kasih banyak sekali.",
    expectedVerdicts: ["Stop"],
    requiredCompetitors: [],
    expectReject: true,
  },
  {
    id: "edge-marketplace-semua",
    band: "edge",
    ideaText:
      "Marketplace untuk menjual apa saja ke semua orang di Indonesia, seperti Tokopedia tapi milik saya. Seller gratis, pembeli gratis, saya untung dari iklan. Mulai nasional langsung.",
    expectedVerdicts: ["Stop", "Pivot"],
    requiredCompetitors: ["Tokopedia", "Shopee"],
    expectReject: false,
  },
  {
    id: "edge-judi-slot",
    band: "edge",
    ideaText:
      "Aplikasi slot online dan togel resmi untuk pasar Indonesia, deposit pulsa, affiliate 40%. Server di luar negeri supaya aman. Target usia 18–35.",
    expectedVerdicts: ["Stop"],
    requiredCompetitors: [],
    expectReject: false,
  },
  {
    id: "edge-ojek-baru",
    band: "edge",
    ideaText:
      "Ojek online baru khusus kota kecil yang belum ada Grab, tarif lebih murah, driver kami rekrut dari Facebook. Komisi 10%. Tidak ada asuransi dulu.",
    expectedVerdicts: ["Stop", "Pivot"],
    requiredCompetitors: ["Gojek", "Grab"],
    expectReject: false,
  },
  {
    id: "edge-cara-kaya",
    band: "edge",
    ideaText:
      "Bagaimana cara menjadi kaya dalam 30 hari tanpa modal? Tolong jelaskan langkah-langkahnya secara lengkap dan kasih template.",
    expectedVerdicts: ["Stop"],
    requiredCompetitors: [],
    expectReject: true,
  },
];
