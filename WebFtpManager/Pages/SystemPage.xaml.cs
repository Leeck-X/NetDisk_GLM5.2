using System;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using WebFtpManager.Services;

namespace WebFtpManager.Pages;

public partial class SystemPage : Page
{
    private readonly ApiClient _api;

    public SystemPage(ApiClient api)
    {
        _api = api;
        InitializeComponent();
    }

    private void Page_Loaded(object sender, RoutedEventArgs e) => _ = RefreshAsync();

    private void Refresh_Click(object sender, RoutedEventArgs e) => _ = RefreshAsync();

    private async Task RefreshAsync()
    {
        try
        {
            var resp = await _api.GetAsync<SystemInfo>("/api/admin/system-info");
            if (!resp.Success || resp.Data == null)
            {
                RuntimePanel.Children.Clear();
                RuntimePanel.Children.Add(MkRow("提示", "服务未运行或未登录"));
                return;
            }
            var d = resp.Data;
            RuntimePanel.Children.Clear();
            foreach (var kv in new (string, string)[]
            {
                ("版本", d.Version),
                ("Node 版本", d.NodeVersion),
                ("PID", d.Pid.ToString()),
                ("启动时间", d.StartTime),
                ("服务运行时长", FormatUptime(d.Uptime)),
                ("进程运行时长", FormatUptime((long)(d.ProcessUptime * 1000))),
                ("监听", $"{d.Host}:{d.Port}"),
            }) RuntimePanel.Children.Add(MkRow(kv.Item1, kv.Item2));

            HostPanel.Children.Clear();
            foreach (var kv in new (string, string)[]
            {
                ("主机名", d.Hostname),
                ("平台", d.Platform),
                ("CPU 核数", d.Cpus.ToString()),
                ("总内存", FormatBytes(d.TotalMem)),
                ("空闲内存", FormatBytes(d.FreeMem)),
            }) HostPanel.Children.Add(MkRow(kv.Item1, kv.Item2));

            StoragePanel.Children.Clear();
            foreach (var kv in new (string, string)[]
            {
                ("数据库文件", d.DbPath),
                ("数据库大小", d.DbSizeHuman),
                ("存储目录", d.StorageDir),
                ("存储已用", d.StorageSizeHuman),
            }) StoragePanel.Children.Add(MkRow(kv.Item1, kv.Item2));

            DirPanel.Children.Clear();
            foreach (var kv in new (string, string)[]
            {
                ("项目根目录", d.RootDir),
                ("数据目录", d.DataDir),
                ("日志目录", d.LogsDir),
            }) DirPanel.Children.Add(MkRow(kv.Item1, kv.Item2));
        }
        catch (Exception ex)
        {
            RuntimePanel.Children.Clear();
            RuntimePanel.Children.Add(MkRow("错误", ex.Message));
        }
    }

    private static Border MkRow(string k, string v)
    {
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(180) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var tb1 = new TextBlock { Text = k, Foreground = new SolidColorBrush(Color.FromRgb(107, 114, 128)), VerticalAlignment = VerticalAlignment.Center };
        Grid.SetColumn(tb1, 0);
        var tb2 = new TextBlock { Text = v, Foreground = new SolidColorBrush(Color.FromRgb(17, 24, 39)), VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.Wrap };
        Grid.SetColumn(tb2, 1);
        grid.Children.Add(tb1); grid.Children.Add(tb2);
        return new Border
        {
            Child = grid,
            Padding = new System.Windows.Thickness(0, 6, 0, 6),
            BorderBrush = new SolidColorBrush(Color.FromRgb(229, 231, 235)),
            BorderThickness = new System.Windows.Thickness(0, 0, 0, 1),
        };
    }

    private static string FormatUptime(long ms)
    {
        var s = ms / 1000;
        var d = s / 86400; s %= 86400;
        var h = s / 3600; s %= 3600;
        var m = s / 60;
        if (d > 0) return $"{d}天{h}时{m}分";
        if (h > 0) return $"{h}时{m}分";
        return $"{m}分";
    }

    private static string FormatBytes(double bytes)
    {
        if (bytes < 1024) return $"{bytes:F0} B";
        var k = bytes / 1024;
        if (k < 1024) return $"{k:F1} KB";
        var m = k / 1024;
        if (m < 1024) return $"{m:F1} MB";
        var g = m / 1024;
        if (g < 1024) return $"{g:F2} GB";
        return $"{g / 1024:F2} TB";
    }
}

public class SystemInfo
{
    public string Version { get; set; } = "";
    public string NodeVersion { get; set; } = "";
    public string Platform { get; set; } = "";
    public string Hostname { get; set; } = "";
    public int Cpus { get; set; }
    public long TotalMem { get; set; }
    public long FreeMem { get; set; }
    public long Uptime { get; set; }
    public double ProcessUptime { get; set; }
    public string Port { get; set; } = "";
    public string Host { get; set; } = "";
    public string RootDir { get; set; } = "";
    public string DataDir { get; set; } = "";
    public string StorageDir { get; set; } = "";
    public string LogsDir { get; set; } = "";
    public string DbPath { get; set; } = "";
    public long DbSize { get; set; }
    public long StorageSize { get; set; }
    public string DbSizeHuman { get; set; } = "";
    public string StorageSizeHuman { get; set; } = "";
    public int Pid { get; set; }
    public string StartTime { get; set; } = "";
}
