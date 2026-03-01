const express = require("express");
const qs = require("qs");
const cloudscraper = require("cloudscraper");
const axios = require("axios");
const router = express.Router();

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

// Rumah OTP Configuration
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
    const response = await axios({
      method: 'GET',
      url: `${RUMAHOTP_BASE_URL}/deposit/create?amount=${nominal}&payment_id=qris`,
      headers: axiosHeaders,
      timeout: 30000
    });
    return response.data;
  } catch (error) {
    console.error("Rumah OTP Create Error:", error.message);
    throw error;
  }
}

// Helper function untuk cek status Rumah OTP
async function checkRumahOtpStatus(depositId) {
  try {
    const response = await axios({
      method: 'GET',
      url: `${RUMAHOTP_BASE_URL}/deposit/get_status?deposit_id=${depositId}`,
      headers: axiosHeaders,
      timeout: 30000
    });
    return response.data;
  } catch (error) {
    console.error("Rumah OTP Status Error:", error.message);
    throw error;
  }
}

// Helper function untuk cancel Rumah OTP
async function cancelRumahOtpDeposit(depositId) {
  try {
    const response = await axios({
      method: 'GET',
      url: `https://www.rumahotp.com/api/v1/deposit/cancel?deposit_id=${depositId}`,
      headers: axiosHeaders,
      timeout: 30000
    });
    return response.data;
  } catch (error) {
    console.error("Rumah OTP Cancel Error:", error.message);
    throw error;
  }
}

// Get Atlantic deposit methods
async function getAtlanticDepositMethods() {
  try {
    const formData = { api_key: ATLAN_API_KEY };
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

    // TAMBAHKAN QRIS RUMAH OTP dengan nama yang sama seperti di frontend
    const fullUrl = `${req.protocol}://${req.get("host")}`;
    metodeFormatted.push({
      metode: "QRIS-RUMAHOTP", // INI YANG PENTING: kode metode
      type: "qris",
      name: "QRIS (Rumah OTP)", // Nama yang ditampilkan
      min: 1000,
      max: 5000000,
      fee: "0",
      fee_persen: "0",
      status: "aktif",
      img_url: `${fullUrl}/media/metode/qris.png`,
      provider: "rumahotp"
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

  // CEK UNTUK QRIS RUMAH OTP
  if (metode === "QRIS-RUMAHOTP") {
    try {
      console.log("🟢 Processing QRIS Rumah OTP deposit...");
      
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

      // Calculate final balance
      const originalAmount = parseFloat(deposit.currency?.diterima) || parsedNominal;
      let finalBalance = Math.floor(originalAmount);
      
      if (user.role === "user") {
        finalBalance = Math.floor(originalAmount * 0.998);
      } else if (user.role === "reseller") {
        finalBalance = Math.floor(originalAmount * 0.999);
      }

      // Save to history
      const historyData = {
        id: deposit.id,
        reff_id: deposit.id,
        nominal: parsedNominal,
        tambahan: 0,
        fee: originalAmount - finalBalance,
        get_balance: finalBalance,
        metode: "QRIS (Rumah OTP)",
        bank: null,
        tujuan: deposit.qr_string,
        atas_nama: null,
        status: deposit.status || "pending",
        qr_image: deposit.qr_image,
        created_at: new Date(),
        expired_at: deposit.expired_at ? new Date(deposit.expired_at) : null,
        provider: "rumahotp"
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
          metode: "QRIS (Rumah OTP)",
          status: "pending",
          qr_image: deposit.qr_image,
          qr_string: deposit.qr_string,
          tujuan: deposit.qr_string,
          created_at: deposit.created_at,
          expired_at: deposit.expired_at,
          provider: "rumahotp"
        }
      });

    } catch (error) {
      console.error("❌ Error creating QRIS deposit:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat membuat deposit QRIS"
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
        message: "Terjadi kesalahan internal"
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
    console.log("📋 Deposit record:", { 
      id: deposit.id, 
      provider: deposit.provider, 
      status: deposit.status 
    });

    // CEK STATUS RUMAH OTP
    if (deposit.provider === "rumahotp") {
      try {
        console.log("🟢 Checking Rumah OTP status...");
        
        const response = await axios({
          method: 'GET',
          url: `https://www.rumahotp.com/api/v2/deposit/get_status?deposit_id=${id}`,
          headers: axiosHeaders,
          timeout: 10000,
          validateStatus: function (status) {
            return status >= 200 && status < 500;
          }
        });

        console.log("✅ Raw response:", response.data);

        // Jika response sukses
        if (response.data && response.data.success === true && response.data.data) {
          const statusData = response.data.data;

          // Update status jika berubah
          if (statusData.status && statusData.status !== deposit.status) {
            await editHistoryDeposit(user._id, id, statusData.status);
            
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
        }

        // Jika response error, return status dari DB
        return res.status(200).json({
          success: true,
          data: {
            id: deposit.id,
            status: deposit.status || "pending",
            nominal: deposit.nominal,
            get_balance: deposit.get_balance,
            created_at: deposit.created_at,
            expired_at: deposit.expired_at
          }
        });

      } catch (error) {
        console.error("❌ Error checking Rumah OTP status:", error.message);
        
        // Return status dari database
        return res.status(200).json({
          success: true,
          data: {
            id: deposit.id,
            status: deposit.status || "pending",
            nominal: deposit.nominal,
            get_balance: deposit.get_balance,
            created_at: deposit.created_at,
            expired_at: deposit.expired_at
          }
        });
      }
    }

    // CEK STATUS ATLANTIC
    else {
      try {
        const formData = { api_key: ATLAN_API_KEY, id: deposit.id };
        const response = await cloudscraper.post(`${BASE_URL}/deposit/status`, {
          body: qs.stringify(formData),
          headers: cloudscraperHeaders,
          timeout: 30000
        });

        const result = JSON.parse(response);
        
        if (result?.status && result?.data) {
          return res.status(200).json({
            success: true,
            data: result.data
          });
        }

        return res.status(200).json({
          success: true,
          data: {
            id: deposit.id,
            status: deposit.status
          }
        });

      } catch (error) {
        console.error("❌ Error checking Atlantic status:", error);
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
    console.error("❌ Fatal error:", error);
    return res.status(200).json({
      success: true,
      data: {
        id: req.body.id || "unknown",
        status: "pending"
      }
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

    // CANCEL RUMAH OTP
    if (deposit.provider === "rumahotp") {
      try {
        // Cek status dulu
        const statusCheck = await checkRumahOtpStatus(id);
        
        if (statusCheck?.success && statusCheck.data?.status === "success") {
          return res.status(400).json({
            success: false,
            message: "Tidak dapat membatalkan, deposit sudah sukses"
          });
        }

        // Cancel
        const cancelResult = await cancelRumahOtpDeposit(id);
        
        // Update status di DB
        await editHistoryDeposit(user._id, id, "cancel");
        
        return res.status(200).json({
          success: true,
          data: {
            id: id,
            status: "cancel",
            message: "Deposit berhasil dibatalkan"
          }
        });

      } catch (error) {
        console.error("Error cancelling Rumah OTP:", error);
        
        // Tetap cancel di DB
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

    // CANCEL ATLANTIC
    else {
      try {
        const formData = { api_key: ATLAN_API_KEY, id: deposit.id };
        await cloudscraper.post(`${BASE_URL}/deposit/cancel`, {
          body: qs.stringify(formData),
          headers: cloudscraperHeaders,
          timeout: 30000
        });

        await editHistoryDeposit(user._id, id, "cancel");
        
        return res.status(200).json({
          success: true,
          data: {
            id: id,
            status: "cancel"
          }
        });

      } catch (error) {
        console.error("Error cancelling Atlantic:", error);
        
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
    console.error("❌ Error in /deposit/cancel:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal"
    });
  }
});

module.exports = router;
