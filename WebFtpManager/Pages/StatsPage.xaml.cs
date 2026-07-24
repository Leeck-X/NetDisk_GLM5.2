using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using WebFtpManager.Services;

namespace WebFtpManager.Pages;

public partial class StatsPage : Page
{
    private readonly ApiClient _api;
    private CancellationTokenSource? _cts;

    public StatsPage(ApiClient api)
    {
        _api = api;
        InitializeComponent();
    }

    private void Page_Loaded(object sender, RoutedEventArgs e) => StartLoop();

    private void Refresh_Click(object sender, RoutedEventArgs e) => _ = RefreshAsync();

    private async void StartLoop()
    {
        _cts?.Cancel();
        _cts = new CancellationTokenSource();
        var token = _cts.Token;
        await RefreshAsync();
        await Task.Run(async () =>
        {
            while (!token.IsCancellationRequested)
            {
                try { await Task.Delay(5000, token); } catch { break; }
                if (AutoCb.IsChecked != true) continue;
                await Dispatcher.InvokeAsync(async () => await RefreshAsync());
            }
        }, token);
    }

    private async Task RefreshAsync()
    {
        try
        {
            var resp = await _api.GetAsync<StatsData>("/api/admin/request-stats");
            if (!resp.Success || resp.Data == null)
            {
                // 未登录或服务未启动
                LastMinCount.Text = "-";
                LastHourCount.Text = "-";
                return;
            }
            var d = resp.Data;
            LastMinCount.Text = d.LastMinuteCount.ToString();
            LastMinDetail.Text = $"错误 {d.LastMinuteError} · 平均 {d.LastMinuteAvgMs}ms";
            LastHourCount.Text = d.LastHourCount.ToString();
            LastHourDetail.Text = $"错误 {d.LastHourError}";
            UptimeText.Text = FormatUptime(d.Uptime);
            UptimeDetail.Text = $"总请求（1h/24h）：{d.TotalMinute}/{d.TotalHour}";

            DrawChart(MinuteCanvas, d.Minutes ?? new List<Bucket>(), 60);
            DrawChart(HourCanvas, d.Hours ?? new List<Bucket>(), 24);
            TopGrid.ItemsSource = d.TopPaths ?? new List<TopPath>();
        }
        catch (Exception ex)
        {
            LastMinCount.Text = "ERR";
            LastMinDetail.Text = ex.Message;
        }
    }

    private static string FormatUptime(long ms)
    {
        var s = ms / 1000;
        var d = s / 86400; s %= 86400;
        var h = s / 3600; s %= 3600;
        var m = s / 60;
        if (d > 0) return $"{d}d{h}h";
        if (h > 0) return $"{h}h{m}m";
        return $"{m}m";
    }

    private void DrawChart(Canvas canvas, List<Bucket> buckets, int maxBars)
    {
        canvas.Children.Clear();
        if (buckets.Count == 0) return;
        var max = buckets.Max(b => b.Count);
        if (max == 0) max = 1;
        var w = canvas.ActualWidth; if (w <= 0) w = 800;
        var h = canvas.ActualHeight; if (h <= 0) h = 160;
        var barW = w / Math.Max(maxBars, buckets.Count);
        for (var i = 0; i < buckets.Count; i++)
        {
            var b = buckets[i];
            var barH = (b.Count * 1.0 / max) * (h - 20);
            var x = i * barW;
            var rect = new Rectangle
            {
                Width = Math.Max(2, barW - 2),
                Height = Math.Max(2, barH),
                Fill = b.ErrCount > 0 ? Brushes.Orange : new SolidColorBrush(Color.FromRgb(99, 102, 241)),
                ToolTip = $"{new DateTime(1970, 1, 1).AddMilliseconds(b.Ts):HH:mm}\n请求: {b.Count}\n错误: {b.ErrCount}\n平均: {b.AvgMs}ms",
            };
            Canvas.SetLeft(rect, x);
            Canvas.SetTop(rect, h - barH - 16);
            canvas.Children.Add(rect);
        }
    }
}

public class StatsData
{
    public long Uptime { get; set; }
    public int TotalMinute { get; set; }
    public int TotalHour { get; set; }
    public int LastMinuteCount { get; set; }
    public int LastMinuteError { get; set; }
    public int LastMinuteAvgMs { get; set; }
    public int LastHourCount { get; set; }
    public int LastHourError { get; set; }
    public List<Bucket> Minutes { get; set; } = new();
    public List<Bucket> Hours { get; set; } = new();
    public List<TopPath> TopPaths { get; set; } = new();
}

public class Bucket
{
    public long Ts { get; set; }
    public int Count { get; set; }
    public int ErrCount { get; set; }
    public int AvgMs { get; set; }
}

public class TopPath
{
    public string Path { get; set; } = "";
    public int Count { get; set; }
}
