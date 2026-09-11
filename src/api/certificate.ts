import request from '@/utils/request'

export interface MyCertificateItem {
  id: number
  certificateNo: string
  activityTitle: string
  title: string
  issuer: string
  issueTime: string
  fileUrl?: string
  status: number // 1-有效, 2-已撤销, 3-已过期
  revokeReason?: string
}

export interface VerifyCertificateResult {
  certificateNo: string
  studentNameMasked: string // 脱敏姓名: 张*
  title: string
  activityTitle: string
  issuer: string
  issueTime: string
  status: number // 1-有效, 2-已撤销, 3-已过期
  statusText: string
  revokeReason?: string
  verifyTime: string
}

// 前端写死学生内置证书数据（待后端接口完成后无缝对接）
const mockMyCertificates: MyCertificateItem[] = [
  {
    id: 1,
    certificateNo: 'CERT-2026-ACT2-A89F3B12',
    activityTitle: '“青年AI与新质生产力”前沿学术讲座',
    title: '青年AI前沿学术讲座结业证书',
    issuer: '校科技创新协会',
    issueTime: '2026-03-01 17:00:00',
    fileUrl: 'https://images.unsplash.com/photo-1589330694653-dad6bc01cf0f?w=600',
    status: 1
  },
  {
    id: 2,
    certificateNo: 'CERT-2026-ACT1-C45D10E9',
    activityTitle: '2026春季校园阳光晨跑打卡挑战',
    title: '晨跑挑战优秀先锋荣誉证书',
    issuer: '校体育运动委员会',
    issueTime: '2026-03-05 08:30:00',
    fileUrl: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=600',
    status: 1
  },
  {
    id: 3,
    certificateNo: 'CERT-2026-ACT5-77B21C89',
    activityTitle: '开源鸿蒙生态前沿技术公开课',
    title: '开源鸿蒙技术先锋结项证书',
    issuer: '校团委学工部',
    issueTime: '2026-03-08 19:30:00',
    fileUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600',
    status: 1
  }
]

/**
 * 8.1 学生查询我的电子荣誉证书
 */
export async function getMyCertificatesApi(): Promise<MyCertificateItem[]> {
  try {
    const res = await request<MyCertificateItem[]>({
      url: '/certificate/my-list',
      method: 'GET'
    })
    if (Array.isArray(res)) {
      return res
    }
    if ((res as any)?.data && Array.isArray((res as any).data)) {
      return (res as any).data
    }
  } catch (err) {
    console.warn('[Mobile Certificate] My-list API failed, fallback to mock:', err)
  }
  return [...mockMyCertificates]
}

/**
 * 8.2 公开扫码验真证书（真伪核验，完全公开无需登录）
 */
export async function verifyCertificateApi(certificateNo: string): Promise<VerifyCertificateResult> {
  try {
    const res = await request<any>({
      url: `/certificate/verify/${certificateNo}`,
      method: 'GET'
    })
    const data = res?.data || res
    if (data && data.certificateNo) {
      return {
        ...data,
        studentNameMasked: data.studentNameMasked || data.studentName,
        verifyTime: data.verifyTime || new Date().toLocaleString()
      }
    }
  } catch (err) {
    console.warn('[Mobile Certificate] Verify API failed, fallback to mock:', err)
  }

  const trimmed = (certificateNo || '').trim().toUpperCase()
  const matched = mockMyCertificates.find(c => c.certificateNo.toUpperCase() === trimmed)

  if (!matched && !trimmed.includes('CERT')) {
    throw new Error('未检索到此电子防伪编号，请核实编号准确性')
  }

  // 模拟已撤销证书
  if (trimmed.includes('REVOKED') || trimmed.endsWith('REVOKED01')) {
    return {
      certificateNo: trimmed,
      studentNameMasked: '孙*',
      title: '计算机系统竞赛集训结项证书',
      activityTitle: '全国大学生计算机系统能力初赛辅导',
      issuer: '计算机工程学院',
      issueTime: '2026-02-28 12:00:00',
      status: 2,
      statusText: '已作废撤销 (REVOKED)',
      revokeReason: '学生因违反竞赛作弊纪律，经学术委员会核定撤销证书',
      verifyTime: new Date().toLocaleString()
    }
  }

  const item = matched || mockMyCertificates[0]
  return {
    certificateNo: item.certificateNo,
    studentNameMasked: '张*明',
    title: item.title,
    activityTitle: item.activityTitle,
    issuer: item.issuer,
    issueTime: item.issueTime,
    status: item.status,
    statusText: item.status === 1 ? '官方认证有效 (VALID)' : '已作废撤销 (REVOKED)',
    revokeReason: item.revokeReason,
    verifyTime: new Date().toLocaleString()
  }
}
