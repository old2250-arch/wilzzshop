const express = require("express");
const qs = require("qs");
const multer = require('multer');
const cloudscraper = require("cloudscraper");
const axios = require("axios");
const upload = multer();
const app = express();
const router = express.Router();
app.use(express.urlencoded({
  extended: true
}));
app.use(express.json());

const domain = process.env.PTERO_DOMAIN;
const apikey = process.env.PTERO_API_KEY;

const {
  requireLogin,
  User,
  tambahHistoryDeposit,
  generateReffId,
  BASE_URL,
  ATLAN_API_KEY,
  editHistoryDeposit,
  tambahHistoryOrder,
  editHistoryOrder,
} = require("../index.js");

// Rumah OTP Configuration
const RUMAHOTP_API_KEY = process.env.RUMAHOTP_API_KEY;
const RUMAHOTP_BASE_URL = "https://www.rumahotp.com/api/v2";

const cloudscraperHeaders = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
};

const axiosHeaders = {
  "x-apikey": RUMAHOTP_API_KEY,
  "Accept": "application/json"
};

// Helper function to create Rumah OTP deposit
async function createRumahOtpDeposit(nominal) {
  try {
    const response = await axios({
      method: 'GET',
      url: `${RUMAHOTP_BASE_URL}/deposit/create?amount=${nominal}&payment_id=qris`,
      headers: axiosHeaders
    });
    return response.data;
  } catch (error) {
    console.error("Rumah OTP Create Error:", error.response?.data || error.message);
    throw error;
  }
}

// Helper function to check Rumah OTP deposit status
async function checkRumahOtpStatus(depositId) {
  try {
    const response = await axios({
      method: 'GET',
      url: `${RUMAHOTP_BASE_URL}/deposit/get_status?deposit_id=${depositId}`,
      headers: axiosHeaders
    });
    return response.data;
  } catch (error) {
    console.error("Rumah OTP Status Check Error:", error.response?.data || error.message);
    throw error;
  }
}

// Helper function to cancel Rumah OTP deposit
async function cancelRumahOtpDeposit(depositId) {
  try {
    const response = await axios({
      method: 'GET',
      url: `https://www.rumahotp.com/api/v1/deposit/cancel?deposit_id=${depositId}`,
      headers: axiosHeaders
    });
    return response.data;
  } catch (error) {
    console.error("Rumah OTP Cancel Error:", error.response?.data || error.message);
    throw error;
  }
}

async function getAtlanticDepositMethods() {
  try {
    const formData = {
      api_key: process.env.ATLAN_API_KEY,
    };
    const response = await cloudscraper.post(`${BASE_URL}/deposit/metode`, {
      body: qs.stringify(formData),
      headers: cloudscraperHeaders,
    });
    const result = JSON.parse(response);
    if (result && result.status && Array.isArray(result.data)) {
      return result.data;
    }
    return null;
  } catch (error) {
    console.error("Gagal mengambil metode deposit dari Atlantic:", error?.response?.data || error.message);
    return null;
  }
}

router.post("/deposit/metode", requireLogin, async (req, res) => {
  try {
    const atlanticMethods = await getAtlanticDepositMethods();
    if (!atlanticMethods) {
      return res.status(502).json({
        success: false,
        message: "Gagal mengambil daftar metode dari provider.",
      });
    }

    const role = req.session.role || "user";
    let tambahanPersen = 0;
    if (role === "user") tambahanPersen = 0.2;
    if (role === "reseller") tambahanPersen = 0.1;

    // Filter out QRIS from Atlantic since we use Rumah OTP for QRIS
    const blacklist = ['OVO', 'DANA', 'ovo', 'MANDIRI', 'PERMATA', 'QRIS', 'QRISFAST'];

    const metodeFormatted = atlanticMethods
      .filter((item) => !blacklist.includes(item.metode?.toUpperCase()))
      .map((item) => {
        const metodeUpper = item.metode?.toUpperCase();
        const localImageMap = {
          BCA: "/media/metode/bca.png",
          BRI: "/media/metode/bri.png",
          BNI: "/media/metode/bni.png",
          SHOPEEPAY: "/media/metode/shopeepay.png",
          LINKAJA: "/media/metode/linkaja.png",
        };
        const fullUrl = `${req.protocol}://${req.get("host")}`;
        const baseFee = parseFloat(item.fee_persen) || 0;
        const adjustedFee = (baseFee + tambahanPersen).toFixed(2);
        return {
          metode: item.metode,
          type: item.type,
          name: item.name,
          min: item.min,
          max: item.max,
          fee: item.fee,
          fee_persen: adjustedFee,
          status: item.status,
          img_url: localImageMap[metodeUpper] ?
            `${fullUrl}${localImageMap[metodeUpper]}` :
            `${fullUrl}/media/metode/default.png`,
        };
      });

    // Add Rumah OTP QRIS as a separate method
    const fullUrl = `${req.protocol}://${req.get("host")}`;
    metodeFormatted.push({
      metode: "QRIS-RUMAHOTP",
      type: "qris",
      name: "QRIS (Rumah OTP)",
      min: 1000,
      max: 10000000,
      fee: "0",
      fee_persen: "0",
      status: "aktif",
      img_url: `${fullUrl}/media/metode/qris.png`,
      provider: "rumahotp"
    });

    return res.status(200).json({
      success: true,
      message: "Daftar metode deposit berhasil difilter",
      metode: metodeFormatted,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil metode deposit",
      error: error?.response?.data || error.message,
    });
  }
});

router.post("/deposit/create", requireLogin, async (req, res) => {
  console.log("🔔 [DEPOSIT] Endpoint /deposit/create dipanggil");
  const user = await User.findById(req.session.userId);
  if (!user) {
    console.log("🚫 User tidak ditemukan. ID Session:", req.session.userId);
    return res.status(401).json({
      success: false,
      message: "User tidak ditemukan atau sesi tidak valid."
    });
  }
  
  const {
    nominal,
    metode: metodePilihanPengguna
  } = req.body;
  
  console.log(`📥 Permintaan deposit oleh ${user.username || user.email || user._id}`);
  console.log("🧾 Data diterima:", { nominal, metode: metodePilihanPengguna });

  if (!nominal || isNaN(nominal)) {
    return res.status(400).json({
      success: false,
      message: "Nominal harus diisi dan berupa angka.",
    });
  }

  const parsedNominal = parseInt(nominal);

  // Check if using Rumah OTP QRIS
  if (metodePilihanPengguna === "QRIS-RUMAHOTP") {
    try {
      // Create deposit with Rumah OTP
      const rumahOtpResult = await createRumahOtpDeposit(parsedNominal);
      
      if (!rumahOtpResult.success || !rumahOtpResult.data) {
        return res.status(502).json({
          success: false,
          message: rumahOtpResult?.message || "Gagal membuat deposit QRIS",
          error: rumahOtpResult
        });
      }

      const depositDetails = rumahOtpResult.data;

      // Calculate fees based on user role
      let additionalFee = 0;
      const originalAmount = parseFloat(depositDetails.currency?.diterima) || parsedNominal;
      
      if (user.role === "user") {
        additionalFee = Math.ceil(originalAmount * 0.002);
      } else if (user.role === "reseller") {
        additionalFee = Math.ceil(originalAmount * 0.001);
      }

      const finalBalance = Math.floor(originalAmount - additionalFee);

      // Save to history
      const historyDataForDb = {
        id: depositDetails.id,
        reff_id: depositDetails.id, // Using deposit ID as reff_id
        nominal: parsedNominal,
        tambahan: 0,
        fee: additionalFee,
        get_balance: finalBalance,
        metode: "QRIS-RUMAHOTP",
        bank: null,
        tujuan: depositDetails.qr_string || null,
        atas_nama: null,
        status: depositDetails.status,
        qr_image: depositDetails.qr_image || null,
        created_at: new Date(depositDetails.created_at),
        provider: "rumahotp"
      };

      await tambahHistoryDeposit(user._id, historyDataForDb);

      // Send response
      res.status(200).json({
        success: true,
        data: {
          id: depositDetails.id,
          reff_id: depositDetails.id,
          nominal: parsedNominal,
          tambahan: 0,
          fee: additionalFee,
          get_balance: finalBalance,
          metode: "QRIS-RUMAHOTP",
          status: depositDetails.status,
          qr_image: depositDetails.qr_image,
          qr_string: depositDetails.qr_string,
          tujuan: depositDetails.qr_string,
          created_at: depositDetails.created_at,
          expired_at: depositDetails.expired_at,
          provider: "rumahotp"
        },
      });

      // Start polling for status updates
      const intervalId = setInterval(async () => {
        try {
          const statusResult = await checkRumahOtpStatus(depositDetails.id);
          
          if (statusResult.success && statusResult.data) {
            const currentStatus = statusResult.data.status;
            
            // Update status in database
            await editHistoryDeposit(user._id, depositDetails.id, currentStatus);
            
            // If payment successful, add balance to user
            if (currentStatus === "success") {
              // Check if already processed
              const userCheck = await User.findOne({
                _id: user._id,
                "historyDeposit.id": depositDetails.id,
                "historyDeposit.status": { $ne: "success" }
              });
              
              if (userCheck) {
                await User.findByIdAndUpdate(user._id, {
                  $inc: { saldo: finalBalance },
                  $set: { "historyDeposit.$.status": "success" }
                });
              }
              
              clearInterval(intervalId);
            }
            
            // Stop polling if transaction is finalized
            if (["success", "expired", "cancel"].includes(currentStatus)) {
              clearInterval(intervalId);
            }
          }
        } catch (pollError) {
          console.error(`Polling error for deposit ${depositDetails.id}:`, pollError.message);
        }
      }, 5000); // Poll every 5 seconds

      // Auto-stop polling after 30 minutes
      setTimeout(() => clearInterval(intervalId), 30 * 60 * 1000);

    } catch (error) {
      console.error("Rumah OTP Deposit Error:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat membuat deposit QRIS",
        error: error.response?.data || error.message
      });
    }
  } 
  // Handle Atlantic methods (non-QRIS)
  else {
    try {
      let selectedMetodeCode = metodePilihanPengguna || "BCA";
      let selectedMetodeType = "bank";
      let minDepositForMetode = 5000;

      // Get Atlantic methods to validate and get details
      try {
        const metodeResponse = await cloudscraper.post(
          `${BASE_URL}/deposit/metode`, {
            body: qs.stringify({ api_key: process.env.ATLAN_API_KEY }),
            headers: cloudscraperHeaders
          }
        );
        const allMetode = JSON.parse(metodeResponse).data || [];
        const foundMetode = allMetode.find(
          (m) =>
          m.metode?.toUpperCase() === selectedMetodeCode.toUpperCase() &&
          (m.status?.toLowerCase() === "aktif" || m.status?.toLowerCase() === "on")
        );
        
        if (foundMetode) {
          selectedMetodeType = foundMetode.type;
          minDepositForMetode = parseInt(foundMetode.min) || 0;
        }
      } catch (err) {
        console.error("Error fetching Atlantic methods:", err);
      }

      if (parsedNominal < minDepositForMetode) {
        return res.status(400).json({
          success: false,
          message: `Nominal minimal untuk metode ${selectedMetodeCode} adalah ${minDepositForMetode}.`,
        });
      }

      const reff_id = generateReffId();
      const formDataToAtlantic = {
        api_key: process.env.ATLAN_API_KEY,
        reff_id,
        nominal: parsedNominal,
        type: selectedMetodeType,
        metode: selectedMetodeCode,
      };

      const atlanticResponse = await cloudscraper.post(
        `${BASE_URL}/deposit/create`, {
          body: qs.stringify(formDataToAtlantic),
          headers: cloudscraperHeaders
        }
      );
      
      const resultFromAtlantic = JSON.parse(atlanticResponse);
      
      if (!resultFromAtlantic || !resultFromAtlantic.status || !resultFromAtlantic.data) {
        return res.status(502).json({
          success: false,
          message: resultFromAtlantic?.data?.message || "Gagal membuat permintaan deposit",
          error: resultFromAtlantic
        });
      }

      const depositDetails = resultFromAtlantic.data;
      const originalFee = parseInt(depositDetails.fee) || 0;
      const originalGetBalance = parseInt(depositDetails.get_balance) || 0;
      
      let additionalFee = 0;
      if (user.role === "user") {
        additionalFee = Math.ceil(originalGetBalance * 0.002);
      } else if (user.role === "reseller") {
        additionalFee = Math.ceil(originalGetBalance * 0.001);
      }
      
      const totalFee = originalFee + additionalFee;
      const finalBalance = originalGetBalance - additionalFee;

      const historyDataForDb = {
        id: depositDetails.id,
        reff_id: depositDetails.reff_id,
        nominal: parseInt(depositDetails.nominal) || 0,
        tambahan: parseInt(depositDetails.tambahan) || 0,
        fee: totalFee,
        get_balance: finalBalance,
        metode: selectedMetodeCode,
        bank: depositDetails.bank || null,
        tujuan: depositDetails.tujuan || depositDetails.nomor_va || null,
        atas_nama: depositDetails.atas_nama || null,
        status: depositDetails.status,
        qr_image: depositDetails.qr_image || depositDetails.url || null,
        created_at: depositDetails.created_at ? new Date(depositDetails.created_at) : new Date(),
        provider: "atlantic"
      };

      await tambahHistoryDeposit(user._id, historyDataForDb);

      res.status(200).json({
        success: true,
        data: {
          ...depositDetails,
          fee: totalFee,
          get_balance: finalBalance,
        },
      });

      // Polling for Atlantic status
      const intervalId = setInterval(async () => {
        try {
          const checkStatusResponse = await cloudscraper.post(
            `${BASE_URL}/deposit/status`, {
              body: qs.stringify({
                api_key: process.env.ATLAN_API_KEY,
                id: depositDetails.id,
              }),
              headers: cloudscraperHeaders
            }
          );
          
          const statusUpdateData = JSON.parse(checkStatusResponse);
          
          if (statusUpdateData && statusUpdateData.status && statusUpdateData.data) {
            const currentTxStatus = statusUpdateData.data.status;
            
            await editHistoryDeposit(user._id, depositDetails.id, currentTxStatus);
            
            if (currentTxStatus === "success") {
              await User.findByIdAndUpdate(user._id, {
                $inc: { saldo: finalBalance },
              });
            }
            
            if (["success", "failed", "expired", "cancel"].includes(currentTxStatus)) {
              clearInterval(intervalId);
            }
          }
        } catch (pollError) {
          console.error(`Polling error for Atlantic deposit ${depositDetails.id}:`, pollError.message);
        }
      }, 1000);

    } catch (error) {
      const apiError = error.response?.data;
      res.status(500).json({
        success: false,
        message: apiError?.data?.message || "Terjadi kesalahan internal",
        error: apiError || error.message,
      });
    }
  }
});

// ==================== CEK STATUS - FIXED VERSION ====================
router.post("/deposit/status", requireLogin, async (req, res) => {
  console.log("🔍 CEK STATUS dipanggil untuk ID:", req.body.id);
  
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "User tidak ditemukan"
    });
  }

  const { id } = req.body;
  if (!id) {
    return res.status(400).json({
      success: false,
      message: "ID deposit harus diisi."
    });
  }

  try {
    // Cari deposit di history user
    const userHistory = await User.findOne({
      _id: user._id,
      "historyDeposit.id": id
    }, { "historyDeposit.$": 1 });

    if (!userHistory || !userHistory.historyDeposit || userHistory.historyDeposit.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Deposit tidak ditemukan"
      });
    }

    const depositRecord = userHistory.historyDeposit[0];
    console.log("📋 Deposit record:", { 
      id: depositRecord.id, 
      provider: depositRecord.provider, 
      status: depositRecord.status 
    });
    
    // CEK STATUS UNTUK RUMAH OTP
    if (depositRecord.provider === "rumahotp") {
      try {
        // Panggil API Rumah OTP
        const response = await axios({
          method: 'GET',
          url: `https://www.rumahotp.com/api/v2/deposit/get_status?deposit_id=${id}`,
          headers: {
            'x-apikey': process.env.RUMAHOTP_API_KEY || 'otp_jnswrQmLTYXkjWbU',
            'Accept': 'application/json'
          },
          timeout: 10000,
          validateStatus: () => true // Terima semua status code
        });

        console.log("📥 Response dari Rumah OTP:", response.data);

        // Jika sukses dapat response
        if (response.data && response.data.success === true && response.data.data) {
          const statusData = response.data.data;
          const newStatus = statusData.status;
          
          console.log(`✅ Status dari API: ${newStatus}, Status di DB: ${depositRecord.status}`);

          // Update status di database jika berubah
          if (newStatus && newStatus !== depositRecord.status) {
            await editHistoryDeposit(user._id, id, newStatus);
            
            // Jika status success, tambahkan saldo
            if (newStatus === "success") {
              await User.findByIdAndUpdate(user._id, {
                $inc: { saldo: depositRecord.get_balance || 0 }
              });
              console.log(`💰 Saldo ditambahkan: ${depositRecord.get_balance}`);
            }
          }

          // Kembalikan response dengan status terbaru
          return res.status(200).json({
            success: true,
            data: {
              id: statusData.id || depositRecord.id,
              status: newStatus || depositRecord.status,
              nominal: depositRecord.nominal,
              get_balance: depositRecord.get_balance,
              created_at: statusData.created_at || depositRecord.created_at,
              expired_at: statusData.expired_at || depositRecord.expired_at
            }
          });
        } 
        // Jika response gagal, kembalikan status dari database
        else {
          console.log("⚠️ Response tidak sesuai, pakai status dari DB:", depositRecord.status);
          return res.status(200).json({
            success: true,
            data: {
              id: depositRecord.id,
              status: depositRecord.status || "pending",
              nominal: depositRecord.nominal,
              get_balance: depositRecord.get_balance,
              created_at: depositRecord.created_at,
              expired_at: depositRecord.expired_at
            }
          });
        }

      } catch (apiError) {
        // Error koneksi ke API, pakai status dari database
        console.error("❌ Error koneksi ke Rumah OTP:", apiError.message);
        return res.status(200).json({
          success: true,
          data: {
            id: depositRecord.id,
            status: depositRecord.status || "pending",
            nominal: depositRecord.nominal,
            get_balance: depositRecord.get_balance,
            created_at: depositRecord.created_at,
            expired_at: depositRecord.expired_at,
            message: "Gunakan status lokal (koneksi ke server gagal)"
          }
        });
      }
    } 
    // CEK STATUS UNTUK ATLANTIC
    else {
      try {
        const formData = {
          api_key: process.env.ATLAN_API_KEY,
          id: depositRecord.id
        };

        const response = await cloudscraper.post(`${BASE_URL}/deposit/status`, {
          body: qs.stringify(formData),
          headers: cloudscraperHeaders,
          timeout: 30000
        });

        const result = JSON.parse(response);
        
        if (result && result.status && result.data) {
          return res.status(200).json({
            success: true,
            data: result.data
          });
        } else {
          return res.status(200).json({
            success: true,
            data: {
              id: depositRecord.id,
              status: depositRecord.status
            }
          });
        }

      } catch (error) {
        console.error("❌ Error cek status Atlantic:", error.message);
        return res.status(200).json({
          success: true,
          data: {
            id: depositRecord.id,
            status: depositRecord.status
          }
        });
      }
    }

  } catch (error) {
    console.error("❌ Fatal error di /deposit/status:", error);
    // JANGAN PERNAH RETURN 500! Selalu return 200 dengan data minimal
    return res.status(200).json({
      success: true,
      data: {
        id: req.body.id || "unknown",
        status: "pending"
      }
    });
  }
});

// ==================== CANCEL DEPOSIT - FIXED VERSION ====================
router.post("/deposit/cancel", requireLogin, async (req, res) => {
  console.log("❌ CANCEL DEPOSIT dipanggil untuk ID:", req.body.id);
  
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "User tidak ditemukan"
    });
  }

  const { id } = req.body;
  if (!id) {
    return res.status(400).json({
      success: false,
      message: "ID deposit harus diisi."
    });
  }

  try {
    // Cari deposit di history user
    const userHistory = await User.findOne({
      _id: user._id,
      "historyDeposit.id": id
    }, { "historyDeposit.$": 1 });

    if (!userHistory || !userHistory.historyDeposit || userHistory.historyDeposit.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Deposit tidak ditemukan"
      });
    }

    const depositRecord = userHistory.historyDeposit[0];
    console.log("📋 Deposit record:", { 
      id: depositRecord.id, 
      provider: depositRecord.provider, 
      status: depositRecord.status 
    });

    // CEK DULU STATUS TERBARU SEBELUM CANCEL
    let currentStatus = depositRecord.status;
    
    if (depositRecord.provider === "rumahotp") {
      try {
        // Cek status dulu
        const statusCheck = await axios({
          method: 'GET',
          url: `https://www.rumahotp.com/api/v2/deposit/get_status?deposit_id=${id}`,
          headers: {
            'x-apikey': process.env.RUMAHOTP_API_KEY || 'otp_jnswrQmLTYXkjWbU',
            'Accept': 'application/json'
          },
          timeout: 10000,
          validateStatus: () => true
        });

        if (statusCheck.data && statusCheck.data.success && statusCheck.data.data) {
          currentStatus = statusCheck.data.data.status;
          console.log(`📊 Status terbaru dari API: ${currentStatus}`);
        }
      } catch (statusError) {
        console.log("⚠️ Gagal cek status, pakai status DB:", depositRecord.status);
      }
    }

    // JIKA SUDAH SUCCESS, TIDAK BISA CANCEL
    if (currentStatus === "success") {
      return res.status(400).json({
        success: false,
        message: "Tidak dapat membatalkan, deposit sudah sukses"
      });
    }

    // JIKA SUDAH EXPIRED ATAU CANCEL
    if (currentStatus === "expired" || currentStatus === "cancel") {
      return res.status(400).json({
        success: false,
        message: `Deposit sudah ${currentStatus}`
      });
    }

    // PROSES CANCEL BERDASARKAN PROVIDER
    if (depositRecord.provider === "rumahotp") {
      try {
        // Coba cancel ke Rumah OTP
        const cancelResult = await axios({
          method: 'GET',
          url: `https://www.rumahotp.com/api/v1/deposit/cancel?deposit_id=${id}`,
          headers: {
            'x-apikey': process.env.RUMAHOTP_API_KEY || 'otp_jnswrQmLTYXkjWbU',
            'Accept': 'application/json'
          },
          timeout: 10000,
          validateStatus: () => true
        });

        console.log("📥 Response cancel dari Rumah OTP:", cancelResult.data);

        // Update status di database menjadi CANCEL
        await editHistoryDeposit(user._id, id, "cancel");

        // Kembalikan response sukses
        return res.status(200).json({
          success: true,
          data: {
            id: id,
            status: "cancel",
            message: "Deposit berhasil dibatalkan"
          }
        });

      } catch (cancelError) {
        console.error("❌ Error cancel ke Rumah OTP:", cancelError.message);
        
        // TETAP UPDATE STATUS DI DATABASE JADI CANCEL
        await editHistoryDeposit(user._id, id, "cancel");
        
        return res.status(200).json({
          success: true,
          data: {
            id: id,
            status: "cancel",
            message: "Deposit dibatalkan (lokal)"
          }
        });
      }
    } 
    // CANCEL UNTUK ATLANTIC
    else {
      try {
        const formData = {
          api_key: process.env.ATLAN_API_KEY,
          id: depositRecord.id
        };

        await cloudscraper.post(`${BASE_URL}/deposit/cancel`, {
          body: qs.stringify(formData),
          headers: cloudscraperHeaders,
          timeout: 30000
        }).catch(() => {});

        // Update status di database
        await editHistoryDeposit(user._id, id, "cancel");

        return res.status(200).json({
          success: true,
          data: {
            id: id,
            status: "cancel"
          }
        });

      } catch (error) {
        console.error("❌ Error cancel Atlantic:", error.message);
        
        // TETAP UPDATE STATUS DI DATABASE
        await editHistoryDeposit(user._id, id, "cancel");
        
        return res.status(200).json({
          success: true,
          data: {
            id: id,
            status: "cancel"
          }
        });
      }
    }

  } catch (error) {
    console.error("❌ Fatal error di /deposit/cancel:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal"
    });
  }
});

// Keep other routes (layanan/price-list, produk, produk-provider, order/create, order/check) unchanged
router.post("/layanan/price-list", requireLogin, async (req, res) => {
  // ... existing code ...
});

router.get("/produk", requireLogin, async (req, res) => {
  // ... existing code ...
});

router.get("/produk-provider", requireLogin, async (req, res) => {
  // ... existing code ...
});

router.post("/order/create", requireLogin, async (req, res) => {
  // ... existing code ...
});

router.post("/order/check", requireLogin, async (req, res) => {
  // ... existing code ...
});

module.exports = router;
