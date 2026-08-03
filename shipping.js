// shipping.js
// ------------------------------------------------------------------
// 배송비 정책 관리 파일
//
// 이 파일 하나만 고치면 사이트 전체(index1.html 등)에 실시간으로 반영됩니다.
// 다른 파일(app.js 등)은 이 파일의 calculateShippingFee() 함수를 호출만 합니다.
//
// 구성:
//   1) 묶음배송 그룹 설정  - 어떤 품목끼리 무게를 합쳐서 배송비를 한 번만 낼지
//   2) 무게 구간별 요금표  - 합산된 무게(kg)에 따라 얼마를 받을지
//   3) 계산 함수           - 장바구니를 넣으면 배송비를 계산해서 돌려줌
// ------------------------------------------------------------------


// ==================================================================
// 1) 묶음배송 그룹 설정
// ------------------------------------------------------------------
// 같은 그룹(groupId)에 속한 상품들은 무게를 모두 더한 뒤
// "합산 무게 기준 배송비 1건"으로만 계산됩니다. (= 묶음배송 O)
//
// 어느 그룹에도 속하지 않는 상품은 다른 상품과 절대 묶이지 않고
// 그 상품 혼자만의 무게로 배송비가 따로 계산됩니다. (= 묶음배송 X)
//
// matchKeywords: 상품의 productId 또는 productName(상품명)에
// 아래 키워드 중 하나라도 포함되어 있으면 그 그룹으로 인식합니다.
// (대소문자 구분 없음)
//
// ▼ 그룹을 추가/수정하고 싶으면 이 배열만 편집하세요 ▼
const SHIPPING_BUNDLE_GROUPS = [
    {
        groupId: "card_sticker",
        label: "명함/스티커",
        matchKeywords: ["명함", "스티커", "sticker", "01my"]
        // 예: 01my.html(명함) 상품과 스티커 상품은 서로 묶음배송이 가능합니다.
    },

    // 새로운 묶음배송 그룹을 추가하려면 아래처럼 복사해서 늘리면 됩니다.
    // {
    //     groupId: "poster_banner",
    //     label: "포스터/현수막",
    //     matchKeywords: ["포스터", "현수막", "배너"]
    // },
];

// 위 어떤 그룹에도 안 걸리는 상품(예: 명함/스티커 외 다른 품목)은
// 자동으로 "묶음배송 불가 = 개별 배송비 계산" 처리됩니다. (별도 설정 필요 없음)


// ==================================================================
// 1-1) 착불(도서산간) 지역 설정
// ------------------------------------------------------------------
// 배송지 주소(address)에 아래 키워드 중 하나라도 포함되어 있으면
// 배송비를 미리 계산하지 않고 "착불배송"으로 처리합니다.
// (대소문자 구분 없음 / 부분 일치)
//
// ▼ 착불 대상 지역을 추가/수정하고 싶으면 이 배열만 편집하세요 ▼
const SHIPPING_CASH_ON_DELIVERY_KEYWORDS = ["제주", "울릉"];

// 주소 문자열이 착불 대상 지역인지 확인합니다.
function isCashOnDeliveryAddress(address) {
    const text = String(address || "").toLowerCase();
    return SHIPPING_CASH_ON_DELIVERY_KEYWORDS.some(keyword => text.includes(String(keyword).toLowerCase()));
}


// ==================================================================
// 2) 무게 구간별 배송비
// ------------------------------------------------------------------
// maxKg: 합산 무게가 이 값 "이하"일 때 적용되는 요금.
// 반드시 maxKg 오름차순으로 정렬되어 있어야 합니다.
// 마지막 구간(Infinity)은 그보다 위 구간을 초과하는 모든 무게에 적용됩니다.
//
// ▼ 요금표를 바꾸고 싶으면 이 배열만 편집하세요 ▼
const SHIPPING_WEIGHT_TIERS = [
    { maxKg: 5,        fee: 3000 },
    { maxKg: 10,       fee: 4000 },
    { maxKg: 20,       fee: 5000 },
    { maxKg: 30,       fee: 6000 },
    { maxKg: Infinity, fee: 8000 }   // 30kg 초과
];


// ==================================================================
// 3) 계산 함수 (다른 파일에서는 이 아래 함수들만 사용하면 됩니다)
// ------------------------------------------------------------------

// 무게(kg) 하나를 넣으면 구간표를 보고 요금을 반환합니다.
function getShippingFeeByWeight(weightKg) {
    const w = Number(weightKg) || 0;
    for (const tier of SHIPPING_WEIGHT_TIERS) {
        if (w <= tier.maxKg) return tier.fee;
    }
    return SHIPPING_WEIGHT_TIERS[SHIPPING_WEIGHT_TIERS.length - 1].fee;
}

// 상품 하나가 어떤 묶음배송 그룹에 속하는지 찾습니다. 없으면 null(=개별배송).
function findShippingGroupId(item) {
    const optionsText = (item.options && typeof item.options === 'object')
        ? Object.values(item.options).filter(Boolean).join(' ')
        : '';
    const text = `${item.productId || ""} ${item.productName || item.name || ""} ${optionsText}`.toLowerCase();
    for (const group of SHIPPING_BUNDLE_GROUPS) {
        const hit = group.matchKeywords.some(keyword => text.includes(String(keyword).toLowerCase()));
        if (hit) return group.groupId;
    }
    return null;
}

/**
 * 장바구니(cart) 전체의 배송비를 계산합니다.
 * @param {Array} cart - [{ productId, productName, weight, ... }, ...]
 * @param {string} [address] - 배송지 주소. 제주/울릉 등 도서산간이 포함되면
 *                              무게 계산 없이 착불배송으로 처리됩니다.
 * @returns {{ totalFee: number, breakdown: Array<{label:string, weight:number, fee:number, bundled:boolean}>, cashOnDelivery: boolean }}
 *
 *   - 같은 묶음배송 그룹 상품들은 무게를 합쳐 breakdown에 한 줄로 나옵니다. (bundled: true)
 *   - 묶음배송 불가 상품은 각각 별도 줄로 나옵니다. (bundled: false)
 *   - totalFee = breakdown의 fee를 모두 더한 값입니다.
 *   - cashOnDelivery가 true면 착불배송 대상이므로 totalFee는 0이고 breakdown은 비어있습니다.
 *     (실제 배송비는 결제 시 청구하지 않고, 상품 도착 시 택배기사에게 별도로 지불합니다.)
 */
function calculateShippingFee(cart, address) {
    if (isCashOnDeliveryAddress(address)) {
        return { totalFee: 0, breakdown: [], cashOnDelivery: true };
    }

    if (!Array.isArray(cart) || cart.length === 0) {
        return { totalFee: 0, breakdown: [], cashOnDelivery: false };
    }

    // 그룹별로 무게를 합산 (묶음배송 불가 상품은 각자 고유 버킷으로 분리)
    const buckets = {}; // key -> { label, weight, bundled }
    let soloCount = 0;

    cart.forEach(item => {
        const groupId = findShippingGroupId(item);
        const weight = Number(item.weight) || 0;

        if (groupId) {
            if (!buckets[groupId]) {
                const groupDef = SHIPPING_BUNDLE_GROUPS.find(g => g.groupId === groupId);
                buckets[groupId] = {
                    label: groupDef ? groupDef.label : groupId,
                    weight: 0,
                    bundled: true
                };
            }
            buckets[groupId].weight += weight;
        } else {
            soloCount++;
            buckets[`__solo_${soloCount}`] = {
                label: item.productName || item.name || "상품",
                weight: weight,
                bundled: false
            };
        }
    });

    const breakdown = Object.values(buckets).map(b => ({
        label: b.label,
        weight: Math.round(b.weight * 1000) / 1000, // 소수점 3자리까지
        fee: getShippingFeeByWeight(b.weight),
        bundled: b.bundled
    }));

    const totalFee = breakdown.reduce((sum, b) => sum + b.fee, 0);

    return { totalFee, breakdown, cashOnDelivery: false };
}

// 일반 <script> 파일이라 전역(window)에 그대로 노출됩니다.
// (app.js 등 type="module" 스크립트에서도 함수 이름 그대로 호출 가능합니다 - delivery.js와 동일한 방식)
window.calculateShippingFee = calculateShippingFee;
window.getShippingFeeByWeight = getShippingFeeByWeight;
window.findShippingGroupId = findShippingGroupId;
window.isCashOnDeliveryAddress = isCashOnDeliveryAddress;
window.SHIPPING_BUNDLE_GROUPS = SHIPPING_BUNDLE_GROUPS;
window.SHIPPING_WEIGHT_TIERS = SHIPPING_WEIGHT_TIERS;
window.SHIPPING_CASH_ON_DELIVERY_KEYWORDS = SHIPPING_CASH_ON_DELIVERY_KEYWORDS;
