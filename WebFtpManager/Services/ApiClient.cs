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

    /// <summary>根据 .env 推断服务端口</summary>
    public static string GetBaseUrl()
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
        return $"http://127.0.0.1:{port}";
    }

    [GeneratedRegex(@"^\s*PORT\s*=\s*(\d+)")]
    private static partial Regex PortRegex();

    public void SetToken(string token) => _token = token;

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
