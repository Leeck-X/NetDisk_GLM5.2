using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace WebFtpManager.Services;

/// <summary>WebFtp 后端 API 客户端</summary>
public partial class ApiClient : IDisposable
{
    private readonly HttpClient _http;
    private string? _token;

    public ApiClient()
    {
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
    }

    /// <summary>
    /// 后端服务地址：优先使用管理面板中设置的服务器地址（支持远程部署），
    /// 未设置时回退为按 .env 的 PORT 推导的本机地址。
    /// </summary>
    public static string GetBaseUrl()
    {
        var configured = ManagerSettings.Normalize(ManagerSettings.ServerUrl);
        if (configured.Length > 0) return configured;
        return $"http://127.0.0.1:{GetPortFromEnv()}";
    }

    /// <summary>本机默认地址（忽略自定义服务器地址）</summary>
    public static string GetLocalBaseUrl() => $"http://127.0.0.1:{GetPortFromEnv()}";

    private static string GetPortFromEnv()
    {
        var port = "3000";
        var envFile = App.EnvFile;
        if (File.Exists(envFile))
        {
            foreach (var line in File.ReadAllLines(envFile))
            {
                var m = PortRegex().Match(line);
                if (m.Success) { port = m.Groups[1].Value; break; }
            }
        }
        return port;
    }

    [GeneratedRegex(@"^\s*PORT\s*=\s*(\d+)")]
    private static partial Regex PortRegex();

    public void SetToken(string token) => _token = token;

    public void ClearToken() => _token = null;

    public bool HasToken => !string.IsNullOrEmpty(_token);

    /// <summary>探测健康检查接口，用于「测试连接」。baseUrl 为空则用当前生效地址。</summary>
    public async Task<ApiResponse<object>> PingAsync(string? baseUrl = null)
    {
        var root = string.IsNullOrWhiteSpace(baseUrl) ? GetBaseUrl() : ManagerSettings.Normalize(baseUrl);
        var url = root.TrimEnd('/') + "/api/health";
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        var resp = await _http.SendAsync(req);
        var text = await resp.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<ApiResponse<object>>(text, JsonOpts) ?? new ApiResponse<object> { Code = -1, Message = "解析失败" };
    }

    /// <summary>
    /// 确保已登录：已持有 token 直接返回 true；否则尝试用「记住登录」保存的凭据自动登录。
    /// 管理类接口（配置/系统信息/垃圾清理）都要求管理员身份，各页面据此复用会话。
    /// </summary>
    public async Task<bool> EnsureLoginAsync()
    {
        if (!string.IsNullOrEmpty(_token)) return true;
        var (u, p) = SessionStore.Load();
        if (string.IsNullOrEmpty(u) || string.IsNullOrEmpty(p)) return false;
        try
        {
            var resp = await LoginAsync<UserData>(u, p);
            return resp.Success && !string.IsNullOrEmpty(_token);
        }
        catch
        {
            return false;
        }
    }

    public async Task<ApiResponse<T>> LoginAsync<T>(string username, string password)
    {
        var url = GetBaseUrl() + "/api/auth/login";
        var body = JsonSerializer.Serialize(new { username, password });
        var resp = await _http.PostAsync(url, new StringContent(body, Encoding.UTF8, "application/json"));
        var text = await resp.Content.ReadAsStringAsync();
        var api = JsonSerializer.Deserialize<ApiResponse<LoginData>>(text, JsonOpts)!;
        if (api.Code == 0 && api.Data?.Token != null) _token = api.Data.Token;
        return new ApiResponse<T> { Code = api.Code, Message = api.Message, Data = (T?)(object?)api.Data };
    }

    public async Task<ApiResponse<T>> GetAsync<T>(string path)
    {
        var url = GetBaseUrl() + path;
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        ApplyAuth(req);
        var resp = await _http.SendAsync(req);
        var text = await resp.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<ApiResponse<T>>(text, JsonOpts) ?? new ApiResponse<T> { Code = -1, Message = "解析失败" };
    }

    public async Task<ApiResponse<T>> SendAsync<T>(string method, string path, object? body = null)
    {
        var url = GetBaseUrl() + path;
        using var req = new HttpRequestMessage(new HttpMethod(method), url);
        ApplyAuth(req);
        if (body != null)
        {
            req.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        }
        var resp = await _http.SendAsync(req);
        var text = await resp.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<ApiResponse<T>>(text, JsonOpts) ?? new ApiResponse<T> { Code = -1, Message = "解析失败" };
    }

    private void ApplyAuth(HttpRequestMessage req)
    {
        if (!string.IsNullOrEmpty(_token))
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
    }

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public void Dispose()
    {
        _http.Dispose();
        GC.SuppressFinalize(this);
    }
}

public class ApiResponse<T>
{
    public int Code { get; set; }
    public string? Message { get; set; }
    public T? Data { get; set; }
    public bool Success => Code == 0;
}

public class LoginData
{
    public string Token { get; set; } = "";
    public UserData? User { get; set; }
    public bool ForceChangePassword { get; set; }
}

public class UserData
{
    public string Id { get; set; } = "";
    public string Username { get; set; } = "";
    public string Role { get; set; } = "";
}
