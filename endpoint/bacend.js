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

const axiosHeaders = {
  "x-apikey": RUMAHOTP_API_KEY,
  "Accept": "application/json"
};

// Helper functions
async function createRumahOtpDeposit(nominal) {
  const response = await axios({
    method: 'GET',
    url: `${RUMAHOTP_BASE_URL}/deposit/create?amount=${nominal}&payment_id=qris`,
    headers: axiosHeaders,
    timeout: 30000
  });
  return response.data;
}

async function checkRumahOtpStatus(depositId) {
  const response = await axios({
    method: 'GET',
    url: `${RUMAHOTP_BASE_URL}/deposit/get_status?deposit_id=${depositId}`,
    headers: axiosHeaders,
    timeout: 30000
  });
  return response.data;
}

async function cancelRumahOtpDeposit(depositId) {
  const response = await axios({
    method: 'GET',
    url: `https://www.rumahotp.com/api/v1/deposit/cancel?deposit_id=${depositId}`,
    headers: axiosHeaders,
    timeout: 30000
  });
  return response.data;
}

async function getAtlanticDepositMethods() {
  const formData = { api_key: ATLAN_API_KEY };
  const response = await cloudscraper.post(`${BASE_URL}/deposit/metode`, {
    body: qs.stringify(formData),
    headers: cloudscraperHeaders,
  });
  return JSON.parse(response).data || [];
}

// ==================== ENDPOINT 1: GET METODE DEPOSIT ====================
router.post("/deposit/metode", requireLogin, async (req, res) => {
  try {
    const atlanticMethods = await getAtlanticDepositMethods();
    const role = req.session.role || "user";
    
    let tambahanPersen = 0;
    if (role === "user") tambahanPersen = 0.2;
    if (role === "reseller") tambahanPersen = 0.1;

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

    const fullUrl = `${req.protocol}://${req.get("host")}`;
    metodeFormatted.push({
      metode: "QRIS-RUMAHOTP",
      type: "qris",
      name: "QRIS (Rumah OTP)",
      min: 1000,
      max: 5000000,
      fee: "0",
      fee_persen: "0",
      status: "aktif",
      img_url: `${fullUrl}/media/metode/qris.png`,
      provider: "rumahotp"
    });

    // RESPON DENGAN KEY "metode" (BUKAN "data")
    return res.status(200).json({
      success: true,
      metode: metodeFormatted
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil metode deposit"
    });
  }
});

// ==================== ENDPOINT 2: CREATE DEPOSIT ====================
router.post("/deposit/create", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({ success: false, message: "User tidak ditemukan" });
  }

  const { nominal, metode } = req.body;

  if (!nominal || isNaN(nominal)) {
    return res.status(400).json({ success: false, message: "Nominal harus diisi" });
  }

  const parsedNominal = parseInt(nominal);

  // QRIS RUMAH OTP
  if (metode === "QRIS-RUMAHOTP") {
    try {
      const rumahOtpResult = await createRumahOtpDeposit(parsedNominal);
      
      if (!rumahOtpResult?.success || !rumahOtpResult?.data) {
        return res.status(502).json({ success: false, message: "Gagal membuat deposit QRIS" });
      }

      const deposit = rumahOtpResult.data;
      const originalAmount = parseFloat(deposit.currency?.diterima) || parsedNominal;
      let finalBalance = Math.floor(originalAmount);
      
      if (user.role === "user") {
        finalBalance = Math.floor(originalAmount * 0.998);
      } else if (user.role === "reseller") {
        finalBalance = Math.floor(originalAmount * 0.999);
      }

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

      // RESPON DENGAN KEY "data"
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
      console.error("Error:", error);
      return res.status(500).json({ success: false, message: "Terjadi kesalahan" });
    }
  }

  // ATLANTIC METHODS
  else {
    try {
      const metodeResponse = await cloudscraper.post(`${BASE_URL}/deposit/metode`, {
        body: qs.stringify({ api_key: ATLAN_API_KEY }),
        headers: cloudscraperHeaders
      });
      
      const allMetode = JSON.parse(metodeResponse).data || [];
      const foundMetode = allMetode.find(m => 
        m.metode?.toUpperCase() === metode?.toUpperCase()
      );

      if (!foundMetode) {
        return res.status(400).json({ success: false, message: `Metode ${metode} tidak tersedia` });
      }

      const reff_id = generateReffId();
      
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
        return res.status(502).json({ success: false, message: "Gagal membuat deposit" });
      }

      const deposit = result.data;
      
      const originalGetBalance = parseInt(deposit.get_balance) || parsedNominal;
      let additionalFee = 0;
      
      if (user.role === "user") {
        additionalFee = Math.ceil(originalGetBalance * 0.002);
      } else if (user.role === "reseller") {
        additionalFee = Math.ceil(originalGetBalance * 0.001);
      }

      const finalBalance = originalGetBalance - additionalFee;

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

      // RESPON DENGAN KEY "data"
      return res.status(200).json({
        success: true,
        data: {
          ...deposit,
          fee: historyData.fee,
          get_balance: finalBalance,
        }
      });

    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({ success: false, message: "Terjadi kesalahan" });
    }
  }
});

// ==================== ENDPOINT 3: CHECK DEPOSIT STATUS ====================
router.post("/deposit/status", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({ success: false, message: "User tidak ditemukan" });
  }

  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: "ID deposit harus diisi" });
  }

  try {
    const userHistory = await User.findOne({
      _id: user._id,
      "historyDeposit.id": id
    }, { "historyDeposit.$": 1 });

    if (!userHistory?.historyDeposit?.length) {
      return res.status(404).json({ success: false, message: "Deposit tidak ditemukan" });
    }

    const deposit = userHistory.historyDeposit[0];

    // CEK STATUS RUMAH OTP
    if (deposit.provider === "rumahotp") {
      try {
        const response = await axios({
          method: 'GET',
          url: `https://www.rumahotp.com/api/v2/deposit/get_status?deposit_id=${id}`,
          headers: axiosHeaders,
          timeout: 10000,
          validateStatus: () => true
        });

        if (response.data && response.data.success === true && response.data.data) {
          const statusData = response.data.data;

          if (statusData.status && statusData.status !== deposit.status) {
            await editHistoryDeposit(user._id, id, statusData.status);
            
            if (statusData.status === "success") {
              await User.findByIdAndUpdate(user._id, {
                $inc: { saldo: deposit.get_balance || 0 }
              });
            }
          }

          // RESPON DENGAN KEY "data"
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

        // RESPON DENGAN KEY "data" (dari DB)
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
        // RESPON DENGAN KEY "data" (dari DB)
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
          // RESPON DENGAN KEY "data"
          return res.status(200).json({
            success: true,
            data: result.data
          });
        }

        // RESPON DENGAN KEY "data" (dari DB)
        return res.status(200).json({
          success: true,
          data: {
            id: deposit.id,
            status: deposit.status
          }
        });

      } catch (error) {
        // RESPON DENGAN KEY "data" (dari DB)
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
    // RESPON DENGAN KEY "data" (default)
    return res.status(200).json({
      success: true,
      data: {
        id: req.body.id || "unknown",
        status: "pending"
      }
    });
  }
});

// ==================== ENDPOINT 4: CANCEL DEPOSIT ====================
router.post("/deposit/cancel", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({ success: false, message: "User tidak ditemukan" });
  }

  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: "ID deposit harus diisi" });
  }

  try {
    const userHistory = await User.findOne({
      _id: user._id,
      "historyDeposit.id": id
    }, { "historyDeposit.$": 1 });

    if (!userHistory?.historyDeposit?.length) {
      return res.status(404).json({ success: false, message: "Deposit tidak ditemukan" });
    }

    const deposit = userHistory.historyDeposit[0];

    // CANCEL RUMAH OTP
    if (deposit.provider === "rumahotp") {
      try {
        await cancelRumahOtpDeposit(id).catch(() => {});
        await editHistoryDeposit(user._id, id, "cancel");
        
        // RESPON DENGAN KEY "data"
        return res.status(200).json({
          success: true,
          data: {
            id: id,
            status: "cancel",
            message: "Deposit berhasil dibatalkan"
          }
        });

      } catch (error) {
        await editHistoryDeposit(user._id, id, "cancel");
        
        // RESPON DENGAN KEY "data"
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
        }).catch(() => {});

        await editHistoryDeposit(user._id, id, "cancel");
        
        // RESPON DENGAN KEY "data"
        return res.status(200).json({
          success: true,
          data: {
            id: id,
            status: "cancel"
          }
        });

      } catch (error) {
        await editHistoryDeposit(user._id, id, "cancel");
        
        // RESPON DENGAN KEY "data"
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
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan internal"
    });
  }
});

module.exports = router;
