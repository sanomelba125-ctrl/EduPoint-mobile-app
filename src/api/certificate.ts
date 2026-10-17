import request from '@/utils/request'

export interface MyCertificateItem {
  id: number
  certificateNo: string
  activityId?: number
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

/**
 * 8.1 学生查询我的电子荣誉证书
 */
export async function getMyCertificatesApi(): Promise<MyCertificateItem[]> {
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
  return []
}

/**
 * 8.2 公开扫码验真证书（真伪核验，完全公开无需登录）
 */
export async function verifyCertificateApi(certificateNo: string): Promise<VerifyCertificateResult> {
  const trimmed = (certificateNo || '').trim()
  if (!trimmed) {
    throw new Error('请输入待核验的证书编号')
  }

  const res = await request<any>({
    url: `/certificate/verify/${encodeURIComponent(trimmed)}`,
    method: 'GET'
  })
  const data = res?.data || res
  if (data && data.certificateNo) {
    return {
      ...data,
      studentNameMasked: data.studentNameMasked || data.studentName || '***',
      verifyTime: data.verifyTime || new Date().toLocaleString()
    }
  }
  throw new Error('未检索到此电子防伪编号，请核实编号准确性')
}
