export function safeMessage(value,token=''){let text=String(value||'');if(token)text=text.split(token).join('[已隐藏]');return text.replace(/Bearer\s+\S+|ya29\.[\w.-]+|AIza[\w-]+|sk-[\w-]+/gi,'[已隐藏]').replace(/https?:\/\/\S+/g,'[链接已省略]').slice(0,650);}
export function driveError(status,data,stage,token=''){
 const raw=data?.error||{},reason=safeMessage(raw.details?.find(d=>d.reason)?.reason||raw.errors?.[0]?.reason||raw.status||'',token),message=safeMessage(raw.message||'',token);
 let advice='Google 未接受请求，请查看下方原因。';
 if(/SERVICE_DISABLED|accessNotConfigured|API.*(not.*used|disabled)|has not been used/i.test(reason+' '+message))advice='此 OAuth Client ID 所属的 Google Cloud 项目尚未启用 Google Drive API。请在同一项目启用后等待几分钟，再点击检查连接。';
 else if(status===401)advice='Google 授权已过期或无效，请重新连接 Drive。';
 else if(/storageQuotaExceeded/i.test(reason))advice='Google Drive 存储空间不足，请清理空间后重试。';
 else if(/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(reason))advice='本次授权缺少 Drive 文件权限，请重新连接并同意文件访问。';
 else if(/appNotAuthorizedToFile|insufficientFilePermissions/i.test(reason))advice='当前 Google 账号或此应用无权访问该文件，请连接最初归档时使用的账号和 Client ID。';
 else if(/domainPolicy|ORG_RESTRICTION/i.test(reason))advice='Google Workspace 管理策略限制了访问，请联系该 Google 账号的管理员。';
 else if(status===429||/rateLimit|dailyLimit/i.test(reason))advice='Google Drive 请求额度暂时受限，请稍后手动重试。';
 else if(status===404||status===410)advice=stage.includes('上传')?'上传会话已失效，请重新点击上传。':'文件不存在，或当前账号无权访问该文件。';
 else if(status>=500)advice='Google Drive 服务暂时异常，请稍后重试。';
 else if(status===400)advice='Google 拒绝了请求参数，请将下方具体原因发给我排查。';
 const detail={stage,status,reason:reason||'UNSPECIFIED',message:message||'Google 未返回详细说明'};
 return Object.assign(new Error(`${stage}失败（HTTP ${status}${reason?' · '+reason:''}）。${advice}${message?' Google：'+message:''}`),{status,detail});
}
