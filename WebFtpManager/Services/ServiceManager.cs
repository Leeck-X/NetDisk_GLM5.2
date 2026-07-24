using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace WebFtpManager.Services;

/// <summary>调用 service/manage.mjs 的服务管理器</summary>
public class ServiceManager
{
    private readonly string _script;
    private readonly string _root;

    public ServiceManager()
    {
        _root = App.EffectiveProjectRoot;
        _script = App.ServiceManageScript;
    }

    private static string NodeExe
    {
        get
        {
            // 优先使用项目内 bundled node，否则用系统 PATH
            var candidates = new[]
            {
                Path.Combine(_rootAppDir(), "node.exe"),
                Path.Combine(_rootAppDir(), "node", "node.exe"),
            };
            foreach (var c in candidates) if (File.Exists(c)) return c;
            return "node";
        }
    }

    private static string _rootAppDir() => AppDomain.CurrentDomain.BaseDirectory;

    /// <summary>执行 service/manage.mjs 子命令并返回 stdout</summary>
    public Task<string> RunAsync(string subCommand)
    {
        var tcs = new TaskCompletionSource<string>();
        var psi = new ProcessStartInfo
        {
            FileName = NodeExe,
            Arguments = $"\"{_script}\" {subCommand}",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = _root,
        };
        var p = new Process { StartInfo = psi, EnableRaisingEvents = true };
        var stdout = string.Empty;
        var stderr = string.Empty;
        p.OutputDataReceived += (_, e) => { if (e.Data != null) stdout += e.Data + "\n"; };
        p.ErrorDataReceived += (_, e) => { if (e.Data != null) stderr += e.Data + "\n"; };
        p.Exited += (_, _) =>
        {
            if (p.ExitCode != 0 && !string.IsNullOrWhiteSpace(stderr))
                tcs.TrySetResult(stdout + "\n[stderr]\n" + stderr);
            else
                tcs.TrySetResult(stdout);
        };
        p.Start();
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        return tcs.Task;
    }

    /// <summary>查询服务状态</summary>
    public async Task<ServiceStatus> GetStatusAsync()
    {
        try
        {
            var output = await RunAsync("status");
            // manage.mjs 输出 JSON
            var match = Regex.Match(output, @"\{[\s\S]*\}");
            if (match.Success)
            {
                var json = JsonDocument.Parse(match.Value).RootElement;
                return new ServiceStatus
                {
                    Installed = json.TryGetProperty("installed", out var ins) && ins.GetBoolean(),
                    Running = json.TryGetProperty("running", out var run) && run.GetBoolean(),
                    AutoStart = json.TryGetProperty("autoStart", out var a) && a.GetBoolean(),
                    State = json.TryGetProperty("state", out var s) ? s.GetString() ?? "UNKNOWN" : "UNKNOWN",
                    StartType = json.TryGetProperty("startType", out var st) ? st.GetString() ?? "UNKNOWN" : "UNKNOWN",
                    Pid = json.TryGetProperty("pid", out var pid) && pid.TryGetInt32(out var p) ? p : null,
                };
            }
        }
        catch { /* fallthrough */ }
        return new ServiceStatus();
    }

    public Task<string> InstallAsync() => RunAsync("install");
    public Task<string> UninstallAsync() => RunAsync("uninstall");
    public Task<string> StartAsync() => RunAsync("start");
    public Task<string> StopAsync() => RunAsync("stop");
    public Task<string> RestartAsync() => RunAsync("restart");
    public Task<string> SetAutoStartAsync(bool on) => RunAsync(on ? "autostart-on" : "autostart-off");
}

public class ServiceStatus
{
    public bool Installed { get; set; }
    public bool Running { get; set; }
    public bool AutoStart { get; set; }
    public string State { get; set; } = "UNKNOWN";
    public string StartType { get; set; } = "UNKNOWN";
    public int? Pid { get; set; }

    public string StateText => Running ? "运行中" : Installed ? "已停止" : "未安装";
    public string StateColor => Running ? "#10B981" : Installed ? "#F59E0B" : "#9CA3AF";
}
