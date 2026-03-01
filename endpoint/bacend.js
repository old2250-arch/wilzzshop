const express = require("express");
const qs = require("qs");
const multer = require('multer');
const cloudscraper = require("cloudscraper");
const axios = require("axios");
const upload = multer();
const router = express.Router();

// Middleware
router.use(express.urlencoded({ extended: true }));
router.use(express.json());

const {
  requireLogin,
  User,
  tambahHistoryDeposit,
  generateReffId,
  BASE_URL,
  ATLAN_API_KEY,
  editHistoryDeposit,
} = require("../index.js");

// Rumah OTP Configuration dengan API Key Anda
const RUMAHOTP_API_KEY = "otp_jnswrQmLTYXkjWbU";
const RUMAHOTP_BASE_URL = "https://www.rumahotp.com/api/v2";

const cloudscraperHeaders = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

// Axios headers untuk Rumah OTP
const axiosHeaders = {
  "x-apikey": RUMAHOTP_API_KEY,
  "Accept": "application/json"
};

// Helper function untuk create deposit Rumah OTP
async function createRumahOtpDeposit(nominal) {
  try {
    console.log("📍 Creating Rumah OTP deposit with amount:", nominal);
    const response = await axios({
      method: 'GET',
      url: `${RUMAHOTP_BASE_URL}/deposit/create?amount=${nominal}&payment_id=qris`,
      headers: axiosHeaders,
      timeout: 30000
    });
    console.log("✅ Rumah OTP response:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Rumah OTP Create Error:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw error;
  }
}

// Helper function untuk cek status Rumah OTP
async function checkRumahOtpStatus(depositId) {
  try {
    console.log("📍 Checking Rumah OTP status for:", depositId);
    const response = await axios({
      method: 'GET',
      url: `${RUMAHOTP_BASE_URL}/deposit/get_status?deposit_id=${depositId}`,
      headers: axiosHeaders,
      timeout: 30000
    });
    console.log("✅ Status check response:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Rumah OTP Status Error:", {
      message: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

// Helper function untuk cancel Rumah OTP
async function cancelRumahOtpDeposit(depositId) {
  try {
    console.log("📍 Cancelling Rumah OTP deposit:", depositId);
    const response = await axios({
      method: 'GET',
      url: `https://www.rumahotp.com/api/v1/deposit/cancel?deposit_id=${depositId}`,
      headers: axiosHeaders,
      timeout: 30000
    });
    console.log("✅ Cancel response:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Rumah OTP Cancel Error:", {
      message: error.message,
      response: error.response?.data
    });
    throw error;
  }
}

// Get Atlantic deposit methods
async function getAtlanticDepositMethods() {
  try {
    const formData = {
      api_key: ATLAN_API_KEY,
    };
    const response = await cloudscraper.post(`${BASE_URL}/deposit/metode`, {
      body: qs.stringify(formData),
      headers: cloudscraperHeaders,
    });
    return JSON.parse(response).data || [];
  } catch (error) {
    console.error("Gagal mengambil metode Atlantic:", error.message);
    return [];
  }
}

// ENDPOINT: GET DEPOSIT METHODS
router.post("/deposit/metode", requireLogin, async (req, res) => {
  try {
    const atlanticMethods = await getAtlanticDepositMethods();
    const role = req.session.role || "user";
    
    let tambahanPersen = 0;
    if (role === "user") tambahanPersen = 0.2;
    if (role === "reseller") tambahanPersen = 0.1;

    // Filter out QRIS from Atlantic
    const blacklist = ['OVO', 'DANA', 'MANDIRI', 'PERMATA', 'QRIS', 'QRISFAST'];

    const metodeFormatted = atlanticMethods
      .filter((item) => !blacklist.includes(item.metode?.toUpperCase()))
      .map((item) => {
        const fullUrl = `${req.protocol}://${req.get("host")}`;
        return {
          metode: item.metode,
          type: item.type,
          name: item.name,
          min: item.min,
          max: item.max,
          fee: item.fee,
          fee_persen: ((parseFloat(item.fee_persen) || 0) + tambahanPersen).toFixed(2),
          status: item.status,
          img_url: `${fullUrl}/media/metode/${item.metode?.toLowerCase()}.png`,
          provider: "atlantic"
        };
      });

    // Add WilzzShop QRIS (using Rumah OTP)
    const fullUrl = `${req.protocol}://${req.get("host")}`;
    metodeFormatted.push({
      metode: "WILZZSHOP-QRIS",
      type: "qris",
      name: "Qris WilzzShop",
      min: 1000,
      max: 5000000,
      fee: "0",
      fee_persen: "0",
      status: "aktif",
      img_url: `${fullUrl}/media/metode/qris.png`,
      provider: "wilzzshop"
    });

    return res.status(200).json({
      success: true,
      data: metodeFormatted
    });

  } catch (error) {
    console.error("Error in /deposit/metode:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil metode deposit"
    });
  }
});

// ENDPOINT: CREATE DEPOSIT
router.post("/deposit/create", requireLogin, async (req, res) => {
  console.log("🔔 [DEPOSIT] /deposit/create dipanggil");
  
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "User tidak ditemukan"
    });
  }

  const { nominal, metode } = req.body;
  console.log("📥 Data:", { nominal, metode, user: user.username });

  if (!nominal || isNaN(nominal)) {
    return res.status(400).json({
      success: false,
      message: "Nominal harus diisi dan berupa angka"
    });
  }

  const parsedNominal = parseInt(nominal);

  // WILZZSHOP QRIS (Rumah OTP)
  if (metode === "WILZZSHOP-QRIS") {
    try {
      console.log("🟢 Processing WilzzShop QRIS deposit...");
      
      // Create deposit with Rumah OTP
      const rumahOtpResult = await createRumahOtpDeposit(parsedNominal);
      
      if (!rumahOtpResult?.success || !rumahOtpResult?.data) {
        return res.status(502).json({
          success: false,
          message: "Gagal membuat deposit QRIS, silakan coba lagi"
        });
      }

      const deposit = rumahOtpResult.data;
      console.log("✅ Deposit created:", deposit.id);

      // Calculate final balance (dipotong fee)
      const originalAmount = parseFloat(deposit.currency?.diterima) || parsedNominal;
      let finalBalance = Math.floor(originalAmount);
      
      if (user.role === "user") {
        finalBalance = Math.floor(originalAmount * 0.998); // Potongan 0.2%
      } else if (user.role === "reseller") {
        finalBalance = Math.floor(originalAmount * 0.999); // Potongan 0.1%
      }

      // Save to history
      const historyData = {
        id: deposit.id,
        reff_id: deposit.id,
        nominal: parsedNominal,
        tambahan: 0,
        fee: originalAmount - finalBalance,
        get_balance: finalBalance,
        metode: "Qris WilzzShop",
        bank: null,
        tujuan: deposit.qr_string,
        atas_nama: null,
        status: deposit.status || "pending",
        qr_image: deposit.qr_image,
        created_at: new Date(),
        expired_at: deposit.expired_at ? new Date(deposit.expired_at) : null,
        provider: "wilzzshop"
      };

      await tambahHistoryDeposit(user._id, historyData);
      console.log("💾 History saved for user:", user._id);

      // Return success response
      return res.status(200).json({
        success: true,
        data: {
          id: deposit.id,
          reff_id: deposit.id,
          nominal: parsedNominal,
          fee: originalAmount - finalBalance,
          get_balance: finalBalance,
          metode: "Qris WilzzShop",
          status: "pending",
          qr_image: deposit.qr_image,
          qr_string: deposit.qr_string,
          tujuan: deposit.qr_string,
          created_at: deposit.created_at,
          expired_at: deposit.expired_at,
          provider: "wilzzshop"
        }
      });

    } catch (error) {
      console.error("❌ Error creating WilzzShop deposit:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat membuat deposit QRIS",
        error: error.response?.data?.message || error.message
      });
    }
  }

  // ATLANTIC METHODS
  else {
    try {
      console.log("🔵 Processing Atlantic deposit...");
      
      // Get method details
      const metodeResponse = await cloudscraper.post(`${BASE_URL}/deposit/metode`, {
        body: qs.stringify({ api_key: ATLAN_API_KEY }),
        headers: cloudscraperHeaders
      });
      
      const allMetode = JSON.parse(metodeResponse).data || [];
      const foundMetode = allMetode.find(m => 
        m.metode?.toUpperCase() === metode?.toUpperCase() && 
        m.status?.toLowerCase() === "aktif"
      );

      if (!foundMetode) {
        return res.status(400).json({
          success: false,
          message: `Metode ${metode} tidak tersedia`
        });
      }

      if (parsedNominal < parseInt(foundMetode.min)) {
        return res.status(400).json({
          success: false,
          message: `Minimal deposit ${foundMetode.min}`
        });
      }

      const reff_id = generateReffId();
      
      // Create Atlantic deposit
      const atlanticResponse = await cloudscraper.post(`${BASE_URL}/deposit/create`, {
        body: qs.stringify({
          api_key: ATLAN_API_KEY,
          reff_id,
          nominal: parsedNominal,
          type: foundMetode.type,
          metode: foundMetode.metode,
        }),
        headers: cloudscraperHeaders
      });

      const result = JSON.parse(atlanticResponse);
      
      if (!result?.status || !result?.data) {
        return res.status(502).json({
          success: false,
          message: result?.message || "Gagal membuat deposit"
        });
      }

      const deposit = result.data;
      
      // Calculate fees
      const originalGetBalance = parseInt(deposit.get_balance) || parsedNominal;
      let additionalFee = 0;
      
      if (user.role === "user") {
        additionalFee = Math.ceil(originalGetBalance * 0.002);
      } else if (user.role === "reseller") {
        additionalFee = Math.ceil(originalGetBalance * 0.001);
      }

      const finalBalance = originalGetBalance - additionalFee;

      // Save to history
      const historyData = {
        id: deposit.id,
        reff_id: deposit.reff_id,
        nominal: parsedNominal,
        tambahan: parseInt(deposit.tambahan) || 0,
        fee: (parseInt(deposit.fee) || 0) + additionalFee,
        get_balance: finalBalance,
        metode: foundMetode.metode,
        bank: deposit.bank || null,
        tujuan: deposit.tujuan || deposit.nomor_va || null,
        atas_nama: deposit.atas_nama || null,
        status: deposit.status,
        qr_image: deposit.qr_image || deposit.url || null,
        created_at: new Date(),
        provider: "atlantic"
      };

      await tambahHistoryDeposit(user._id, historyData);

      return res.status(200).json({
        success: true,
        data: {
          ...deposit,
          fee: historyData.fee,
          get_balance: finalBalance,
        }
      });

    } catch (error) {
      console.error("❌ Error creating Atlantic deposit:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan internal",
        error: error.response?.data || error.message
      });
    }
  }
});

// ENDPOINT: CHECK DEPOSIT STATUS
router.post("/deposit/status", requireLogin, async (req, res) => {
  console.log("🔍 [DEPOSIT] /deposit/status dipanggil");
  
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "User tidak ditemukan"
    });
  }

  const { id } = req.body;
  console.log("📥 Checking status for ID:", id);

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "ID deposit harus diisi"
    });
  }

  try {
    // Cari di history user
    const userHistory = await User.findOne({
      _id: user._id,
      "historyDeposit.id": id
    }, { "historyDeposit.$": 1 });

    if (!userHistory?.historyDeposit?.length) {
      return res.status(404).json({
        success: false,
        message: "Deposit tidak ditemukan"
      });
    }

    const deposit = userHistory.historyDeposit[0];
    console.log("📋 Deposit record:", { id: deposit.id, provider: deposit.provider, status: deposit.status });

    // CEK STATUS WILZZSHOP QRIS (Rumah OTP)
    if (deposit.provider === "wilzzshop") {
      try {
        const statusResult = await checkRumahOtpStatus(id);
        
        if (!statusResult?.success) {
          // If API fails, return last known status from DB
          return res.status(200).json({
            success: true,
            data: {
              id: deposit.id,
              status: deposit.status || "pending",
              message: "Menggunakan status terakhir"
            }
          });
        }

        const statusData = statusResult.data;
        console.log("✅ Status from Rumah OTP:", statusData.status);

        // Update status if changed
        if (statusData.status !== deposit.status) {
          await editHistoryDeposit(user._id, id, statusData.status);
          
          // If success, add balance
          if (statusData.status === "success") {
            await User.findByIdAndUpdate(user._id, {
              $inc: { saldo: deposit.get_balance || 0 }
            });
          }
        }

        return res.status(200).json({
          success: true,
          data: {
            id: statusData.id || deposit.id,
            status: statusData.status || deposit.status,
            nominal: deposit.nominal,
            get_balance: deposit.get_balance,
            created_at: statusData.created_at || deposit.created_at,
            expired_at: statusData.expired_at || deposit.expired_at
          }
        });

      } catch (error) {
        console.error("Error checking WilzzShop status:", error);
        // Return last known status from DB if API fails
        return res.status(200).json({
          success: true,
          data: {
            id: deposit.id,
            status: deposit.status || "pending",
            message: "Gagal cek ke server, menggunakan status terakhir"
          }
        });
      }
    }

    // CEK STATUS ATLANTIC
    else {
      try {
        const formData = {
          api_key: ATLAN_API_KEY,
          id: deposit.id
        };

        const response = await cloudscraper.post(`${BASE_URL}/deposit/status`, {
          body: qs.stringify(formData),
          headers: cloudscraperHeaders,
          timeout: 30000
        });

        const result = JSON.parse(response);
        
        if (!result?.status || !result?.data) {
          return res.status(200).json({
            success: true,
            data: {
              id: deposit.id,
              status: deposit.status,
              message: "Gagal update dari server"
            }
          });
        }

        const statusData = result.data;

        // Update if status changed
        if (statusData.status !== deposit.status) {
          await editHistoryDeposit(user._id, id, statusData.status);
        }

        return res.status(200).json({
          success: true,
          data: statusData
        });

      } catch (error) {
        console.error("Error checking Atlantic status:", error);
        return res.status(200).json({
          success: true,
          data: {
            id: deposit.id,
            status: deposit.status
          }
        });
      }
    }

  } catch (error) {
    console.error("❌ Error in /deposit/status:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal"
    });
  }
});

// ENDPOINT: CANCEL DEPOSIT
router.post("/deposit/cancel", requireLogin, async (req, res) => {
  console.log("❌ [DEPOSIT] /deposit/cancel dipanggil");
  
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "User tidak ditemukan"
    });
  }

  const { id } = req.body;
  console.log("📥 Cancelling ID:", id);

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "ID deposit harus diisi"
    });
  }

  try {
    // Cari deposit di history
    const userHistory = await User.findOne({
      _id: user._id,
      "historyDeposit.id": id
    }, { "historyDeposit.$": 1 });

    if (!userHistory?.historyDeposit?.length) {
      return res.status(404).json({
        success: false,
        message: "Deposit tidak ditemukan"
      });
    }

    const deposit = userHistory.historyDeposit[0];

    // CANCEL WILZZSHOP QRIS (Rumah OTP)
    if (deposit.provider === "wilzzshop") {
      try {
        // Cek dulu status terbaru
        const statusCheck = await checkRumahOtpStatus(id);
        
        // If already success, cannot cancel
        if (statusCheck?.success && statusCheck.data?.status === "success") {
          return res.status(400).json({
            success: false,
            message: "Tidak dapat membatalkan, deposit sudah sukses"
          });
        }

        // If already expired or cancelled
        if (statusCheck?.success && ["expired", "cancel"].includes(statusCheck.data?.status)) {
          return res.status(400).json({
            success: false,
            message: `Deposit sudah ${statusCheck.data.status}`
          });
        }

        // Try to cancel
        const cancelResult = await cancelRumahOtpDeposit(id);
        
        if (cancelResult?.success) {
          // Update status in DB
          await editHistoryDeposit(user._id, id, "cancel");
          
          return res.status(200).json({
            success: true,
            data: {
              id: id,
              status: "cancel",
              message: "Deposit berhasil dibatalkan"
            }
          });
        } else {
          // If cancel fails, just update status in DB
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

      } catch (error) {
        console.error("Error cancelling WilzzShop deposit:", error);
        
        // If API fails, still mark as cancelled in DB
        await editHistoryDeposit(user._id, id, "cancel");
        
        return res.status(200).json({
          success: true,
          data: {
            id: id,
            status: "cancel",
            message: "Deposit dibatalkan (offline mode)"
          }
        });
      }
    }

    // CANCEL ATLANTIC
    else {
      try {
        const formData = {
          api_key: ATLAN_API_KEY,
          id: deposit.id
        };

        const response = await cloudscraper.post(`${BASE_URL}/deposit/cancel`, {
          body: qs.stringify(formData),
          headers: cloudscraperHeaders,
          timeout: 30000
        });

        const result = JSON.parse(response);
        
        if (result?.status && result?.data) {
          await editHistoryDeposit(user._id, id, "cancel");
          
          return res.status(200).json({
            success: true,
            data: result.data
          });
        } else {
          // Force cancel in DB
          await editHistoryDeposit(user._id, id, "cancel");
          
          return res.status(200).json({
            success: true,
            data: {
              id: id,
              status: "cancel"
            }
          });
        }

      } catch (error) {
        console.error("Error cancelling Atlantic deposit:", error);
        
        // Force cancel in DB
        await editHistoryDeposit(user._id, id, "cancel");
        
        return res.status(200).json({
          success: true,
          data: {
            id: id,
            status: "cancel",
            message: "Deposit dibatalkan"
          }
        });
      }
    }

  } catch (error) {
    console.error("❌ Error in /deposit/cancel:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal"
    });
  }
});

// TEST ENDPOINT untuk cek koneksi Rumah OTP
router.get("/test/rumahotp", requireLogin, async (req, res) => {
  try {
    const testDeposit = await createRumahOtpDeposit(10000);
    res.json({
      success: true,
      message: "Koneksi ke Rumah OTP berhasil",
      data: testDeposit
    });
  } catch (error) {
    res.json({
      success: false,
      message: "Koneksi gagal",
      error: error.message
    });
  }
});

module.exports = router;
