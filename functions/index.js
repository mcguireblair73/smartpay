const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripeLib = require('stripe');

// 初始化
admin.initializeApp();
const db = admin.firestore();
const stripe = stripeLib(
  'pk_live_51RUYtkLU1eQM2LmiVKyN4Ees6AH0z1k5w1ahWcHwTzmWnIZiENdGprljEPoKiBJXK3sJLPSGpX7j9kweWeIYvQRo006ibGGt7l'
);

/** 账户与基础信息 **/

// 更新运营者业务信息
exports.updateBusinessInformationForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const { key, value } = data;
  if (!key) throw new functions.https.HttpsError('invalid-argument', '缺少字段');
  await db.collection('businessInfo').doc(context.auth.uid).update({ [key]: value });
  return { message: '业务信息已更新', updatedField: key };
});

// 获取业务信息
exports.getBusinessInformationForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const doc = await db.collection('businessInfo').doc(context.auth.uid).get();
  if (!doc.exists) throw new functions.https.HttpsError('not-found', '未找到业务信息');
  return { information: doc.data() };
});

// 修改邮箱（需你补充邮件发送逻辑）
exports.updateEmailAddressForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  // TODO: 发送邮箱确认邮件
  return { message: '邮箱修改请求已提交，请查收确认邮件' };
});

// 设置手机号并发验证码
exports.setUserPhoneNumberForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const { phoneNumber } = data;
  if (!phoneNumber) throw new functions.https.HttpsError('invalid-argument', '手机号不能为空');
  await db.collection('users').doc(context.auth.uid).update({ phone: phoneNumber, phoneVerified: false });
  // 这里应发送真实验证码，演示写死
  await db.collection('phoneVerifications').doc(context.auth.uid).set({ code: '123456' });
  return { outcome: 'verifyCodeSent' };
});

// 校验验证码
exports.verifyCodeForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const { code } = data;
  if (!code) throw new functions.https.HttpsError('invalid-argument', '验证码不能为空');
  const doc = await db.collection('phoneVerifications').doc(context.auth.uid).get();
  if (!doc.exists || doc.data().code !== code) throw new functions.https.HttpsError('invalid-argument', '验证码错误');
  await db.collection('users').doc(context.auth.uid).update({ phoneVerified: true });
  return { outcome: 'success' };
});

// 请求重置密码（请补充实际重置逻辑）
exports.passwordResetRequest = functions.https.onCall(async (data, context) => {
  const { emailAddress } = data;
  // TODO: 通过 Firebase Auth SDK 发送密码重置邮件
  return { message: '重置密码邮件已发送' };
});

/** 订阅服务 **/
exports.enableFullServiceSupport = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  await db.collection('users').doc(context.auth.uid).update({ fullServiceSupport: true });
  return { message: 'Full Service Support 服务已启用' };
});
exports.disableFullServiceSupport = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  await db.collection('users').doc(context.auth.uid).update({ fullServiceSupport: false });
  return { message: 'Full Service Support 服务已取消' };
});

/** 支付相关 **/
exports.getCustomerPaymentSourcesForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const doc = await db.collection('users').doc(context.auth.uid).get();
  const stripeCustomerId = doc.data().stripeCustomerId;
  if (!stripeCustomerId) throw new functions.https.HttpsError('failed-precondition', '未绑定Stripe账户');
  const sources = await stripe.customers.listSources(stripeCustomerId, { object: 'card' });
  const cards = sources.data.map(card => ({
    id: card.id, last4: card.last4, brand: card.brand, expMonth: card.exp_month, expYear: card.exp_year
  }));
  return { sources: cards };
});

exports.addPaymentSourceForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const { token } = data;
  const doc = await db.collection('users').doc(context.auth.uid).get();
  const stripeCustomerId = doc.data().stripeCustomerId;
  if (!stripeCustomerId) throw new functions.https.HttpsError('failed-precondition', '未绑定Stripe账户');
  const card = await stripe.customers.createSource(stripeCustomerId, { source: token });
  return { message: '新的支付方式已添加', card: { id: card.id, last4: card.last4, brand: card.brand } };
});

exports.removePaymentSourceForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const { sourceId } = data;
  const doc = await db.collection('users').doc(context.auth.uid).get();
  const stripeCustomerId = doc.data().stripeCustomerId;
  if (!stripeCustomerId) throw new functions.https.HttpsError('failed-precondition', '未绑定Stripe账户');
  await stripe.customers.deleteSource(stripeCustomerId, sourceId);
  return { message: '支付方式已移除' };
});

// 获取1099报税表
exports.get1099FormsForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const snapshot = await db.collection('taxForms').where('userId', '==', context.auth.uid).get();
  const forms = snapshot.docs.map(doc => {
    const d = doc.data();
    return { name: d.fileName, url: d.downloadUrl };
  });
  return { forms };
});

// 退款
exports.getRefundRequestsForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const { transactionId } = data;
  if (!transactionId) throw new functions.https.HttpsError('invalid-argument', '缺少交易ID');
  // TODO: Stripe 退款操作
  await db.collection('transactions').doc(transactionId)
    .update({ refundState: 3, refundedAt: new Date() });
  return { message: '交易已退款' };
});

// 查询交易
exports.getTransactionsForOperatorV2 = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const { startDate, endDate } = data;
  let query = db.collection('transactions').where('operatorId', '==', context.auth.uid);
  if (startDate) query = query.where('date', '>=', new Date(startDate));
  if (endDate) query = query.where('date', '<=', new Date(endDate));
  const snapshot = await query.get();
  const transactions = snapshot.docs.map(doc => doc.data());
  return { transactions };
});

// 导出交易记录
exports.exportTransactionsCSV = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  // TODO: 生成并发邮件
  return { message: '交易记录导出成功，CSV已发送至您的邮箱' };
});

/** 店员管理 **/
exports.getAttendantsForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const snapshot = await db.collection('attendants').where('operatorId', '==', context.auth.uid).get();
  return { attendants: snapshot.docs.map(doc => doc.data()) };
});
exports.addAttendantForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const { firstName, lastName, email } = data;
  if (!firstName || !email) throw new functions.https.HttpsError('invalid-argument', '信息不完整');
  const docRef = await db.collection('attendants').add({
    operatorId: context.auth.uid, firstName, lastName, email
  });
  return { message: '店员添加成功', attendantId: docRef.id };
});
exports.removeAttendantForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const { attendantId } = data;
  if (!attendantId) throw new functions.https.HttpsError('invalid-argument', '缺少ID');
  await db.collection('attendants').doc(attendantId).delete();
  return { message: '店员已移除' };
});

/** 客户和权限列表 **/
exports.getAccessListsForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const snapshot = await db.collection('accessLists').where('operatorId', '==', context.auth.uid).get();
  const accessLists = snapshot.docs.map(doc => ({ listId: doc.id, listName: doc.data().listName }));
  return { accessLists };
});
exports.getCustomersForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const snapshot = await db.collection('customers').where('operatorId', '==', context.auth.uid).get();
  const customers = {};
  snapshot.forEach(doc => {
    const d = doc.data();
    customers[doc.id] = {
      email: d.email,
      firstTransaction: d.firstTransaction,
      lastTransaction: d.lastTransaction,
      transactionCount: d.transactionCount,
      gross: d.gross,
      refunds: d.refunds
    };
  });
  return { customers };
});

/** 设备管理（以不同类型设备举例，结构类似） **/
// 示例：获取用户关联的机器列表
exports.getMachinesForOperator = functions.https.onCall(async (data, context) => {
  // 验证用户登录
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', '用户未登录');
  }

  const userId = context.auth.uid;

  try {
    // 从 Firestore 查询该用户的机器数据
    const snapshot = await admin.firestore()
      .collection('machines')
      .where('ownerId', '==', userId)
      .get();

    const machines = [];
    snapshot.forEach(doc => {
      machines.push({
        machineID: doc.id,
        ...doc.data()
      });
    });

    return { machines };
  } catch (error) {
    throw new functions.https.HttpsError('internal', '查询失败', error.message);
  }
});

/**
 * 新增设备
 */
exports.addMachineToAccountForOperator = functions.https.onCall(async (data, context) => {
    console.log('收到参数:', data);

    // 兼容各种字段名写法
    const machineID = data.machineID || data.machineId;
    const machinePrice = data.machinePrice || data.price;
    const locationID = data.locationID || data.locationId;
    const storeName = data.storeName || data.locationName;
    const machineType = data.machineType || data.type;

    if (!machineID || !/^\d{6}$/.test(machineID)) {
        throw new functions.https.HttpsError('invalid-argument', '无效设备ID');
    }
    if (!machinePrice || isNaN(machinePrice)) {
        throw new functions.https.HttpsError('invalid-argument', '无效价格');
    }
    if (!locationID || !storeName || !machineType) {
        throw new functions.https.HttpsError('invalid-argument', '缺少参数');
    }

    const machineRef = db.collection('machines').doc(machineID);
    const existing = await machineRef.get();
    if (existing.exists) {
        return 'error';
    }

    await machineRef.set({
        operatorId: context.auth.uid,
        machineID,
        machinePrice: parseFloat(machinePrice),
        locationID,
        storeName,
        machineType,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return 'success';
});


/**
 * 获取运营者地点
 */
exports.getLocationsForOperator = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请先登录');
    const snapshot = await db.collection('stores').where('operatorId', '==', context.auth.uid).get();
    const stores = snapshot.docs.map(doc => ({
        sid: doc.id,
        ...doc.data()
    }));
    return { stores };
});


/**
 * 获取设备类型
 */
exports.getMachineTypesForOperator = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请先登录');
    const doc = await db.collection('machineTypes').doc(context.auth.uid).get();
    let types = [];
    if (doc.exists) types = doc.data().types || [];
    return { types };
});

/**
 * 更新设备类型
 */
exports.updateMachineTypesForOperator = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请先登录');
    const { types_array } = data;
    if (!Array.isArray(types_array)) throw new functions.https.HttpsError('invalid-argument', '类型必须为数组');
    await db.collection('machineTypes').doc(context.auth.uid).set({ types: types_array });
    return { message: '设备类型列表已更新', types: types_array };
});

// 可复制类似写法添加 addEVCharger, addMechanicalSpark, addChargeSpark, addPowerSpark, addParkingSpot

/** 地点管理 **/
exports.getLocationsForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const snapshot = await db.collection('stores').where('operatorId', '==', context.auth.uid).get();
  const stores = snapshot.docs.map(doc => ({
    sid: doc.id,
    ...doc.data()
  }));
  return { stores }; // 这样前端 result.data.stores 就不会报错
});

exports.createStoreForOperator = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '请登录');
  const storeOBJ = data.storeOBJ || {};
  const { name, addressline1, addressline2, city, state, zipcode, notes } = storeOBJ;
  if (!name || name.trim().length < 3) throw new functions.https.HttpsError('invalid-argument', '地点名称不能为空');
  if (!addressline1) throw new functions.https.HttpsError('invalid-argument', '地址不能为空');
  if (!city) throw new functions.https.HttpsError('invalid-argument', '城市不能为空');
  if (!state) throw new functions.https.HttpsError('invalid-argument', '州不能为空');
  if (!zipcode) throw new functions.https.HttpsError('invalid-argument', '邮编不能为空');
  const docRef = await db.collection('stores').add({
    operatorId: context.auth.uid,
    name,
    address1: addressline1,
    address2: addressline2 || "",
    city,
    state,
    zip: zipcode,
    notes: notes || "",
    createdAt: new Date()
  });
  return { result: '新地点已添加', storeId: docRef.id };
});



