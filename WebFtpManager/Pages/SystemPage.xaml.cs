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
            if (!await _api.EnsureLoginAsync())
            {
                ShowMessage("未登录：请到「用户」页登录并勾选“记住登录”，然后回到此页刷新。");
                return;
            }
            var resp = await _api.GetAsync<SystemInfo>("/api/admin/system-info");
            if (!resp.Success || resp.Data == null)
            {
                ShowMessage(resp.Message ?? "服务未运行或未登录");
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
                ("用户文件占用", d.StorageSizeHuman),
                ("待合并分片", d.ChunksSizeHuman),
                ("缩略图缓存", d.ThumbsSizeHuman),
                ("磁盘总量", d.DiskTotalHuman),
                ("磁盘可用", d.DiskAvailableHuman),
                ("可用(扣除预留)", d.DiskUsableHuman),
                ("预留空间", $"{d.DiskReserveHuman}（{d.DiskReserveRatio * 100:F1}%）"),
            }) StoragePanel.Children.Add(MkRow(kv.Item1, kv.Item2));

            GcPanel.Children.Clear();
            foreach (var kv in new (string, string)[]
            {
                ("分片保留时长", d.ChunkTtlHours > 0 ? $"{d.ChunkTtlHours} 小时" : "不清理"),
                ("孤儿文件保留时长", d.OrphanTtlHours > 0 ? $"{d.OrphanTtlHours} 小时" : "不清理"),
                ("自动清理间隔", $"{d.GcIntervalMinutes} 分钟"),
                ("回收站保留天数", d.TrashRetentionDays > 0 ? $"{d.TrashRetentionDays} 天" : "不自动清理"),
            }) GcPanel.Children.Add(MkRow(kv.Item1, kv.Item2));

            DirPanel.Children.Clear();
            foreach (var kv in new (string, string)[]
            {
                ("项目根目录", d.RootDir),
                ("WebPan 根目录", d.WebpanRoot),
                ("数据目录", d.DataDir),
                ("日志目录", d.LogsDir),
                ("分片目录", d.ChunksDir),
                ("缩略图目录", d.ThumbsDir),
            }) DirPanel.Children.Add(MkRow(kv.Item1, kv.Item2));
        }
        catch (Exception ex)
        {
            ShowMessage(ex.Message);
        }
    }

    private void ShowMessage(string msg)
    {
        RuntimePanel.Children.Clear();
        RuntimePanel.Children.Add(MkRow("提示", msg));
        HostPanel.Children.Clear();
        StoragePanel.Children.Clear();
        GcPanel.Children.Clear();
        DirPanel.Children.Clear();
    }

    private async void Gc_Click(object sender, RoutedEventArgs e)
    {
        if (!await _api.EnsureLoginAsync())
        {
            GcResultText.Text = "未登录：请到「用户」页登录并勾选“记住登录”。";
            return;
        }
        if (MessageBox.Show(
                "确定立即执行一次垃圾清理？\n将清理：超时上传分片、孤儿文件、过期回收站文件、孤儿缩略图。",
                "确认", MessageBoxButton.OKCancel, MessageBoxImage.Warning) != MessageBoxResult.OK) return;
        GcBtn.IsEnabled = false;
        GcResultText.Text = "清理中...";
        try
        {
            var resp = await _api.SendAsync<GcResult>("POST", "/api/admin/gc", null);
            if (!resp.Success || resp.Data == null)
            {
                GcResultText.Text = "清理失败：" + (resp.Message ?? "未知错误");
                return;
            }
            var r = resp.Data;
            GcResultText.Text =
                $"清理完成：分片目录 {r.ChunkDirs} 个、分片记录 {r.ChunkRows} 行、孤儿文件 {r.OrphanFiles} 个、" +
                $"回收站过期 {r.TrashFiles} 个、缩略图缓存 {r.Thumbs} 个；共释放 {r.FreedHuman}。" +
                (r.MissingFiles > 0 ? $"（另有 {r.MissingFiles} 条记录在磁盘上找不到文件，请人工确认）" : "");
            await RefreshAsync();
        }
        catch (Exception ex)
        {
            GcResultText.Text = "清理失败：" + ex.Message;
        }
        finally
        {
            GcBtn.IsEnabled = true;
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
    public string WebpanRoot { get; set; } = "";
    public string DataDir { get; set; } = "";
    public string StorageDir { get; set; } = "";
    public string ChunksDir { get; set; } = "";
    public string LogsDir { get; set; } = "";
    public string ThumbsDir { get; set; } = "";
    public string DbPath { get; set; } = "";
    public long DbSize { get; set; }
    public long StorageSize { get; set; }
    public long ChunksSize { get; set; }
    public long ThumbsSize { get; set; }
    public string DbSizeHuman { get; set; } = "";
    public string StorageSizeHuman { get; set; } = "";
    public string ChunksSizeHuman { get; set; } = "";
    public string ThumbsSizeHuman { get; set; } = "";
    public string DiskTotalHuman { get; set; } = "";
    public string DiskAvailableHuman { get; set; } = "";
    public string DiskUsableHuman { get; set; } = "";
    public string DiskReserveHuman { get; set; } = "";
    public double DiskReserveRatio { get; set; }
    public long ChunkTtlHours { get; set; }
    public long OrphanTtlHours { get; set; }
    public long GcIntervalMinutes { get; set; }
    public long TrashRetentionDays { get; set; }
    public int Pid { get; set; }
    public string StartTime { get; set; } = "";
}

/// <summary>手动垃圾清理（POST /api/admin/gc）返回结果</summary>
public class GcResult
{
    public int ChunkDirs { get; set; }
    public int ChunkRows { get; set; }
    public int OrphanFiles { get; set; }
    public int TrashFiles { get; set; }
    public int Thumbs { get; set; }
    public long FreedBytes { get; set; }
    public string FreedHuman { get; set; } = "";
    public int MissingFiles { get; set; }
}
