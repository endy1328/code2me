package com.example.legacy.web;

import javax.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import com.example.legacy.lib.OpsDashboardService;

@Controller
@RequestMapping("/ops/dashboard")
public class OpsDashboardController {
  private final OpsDashboardService opsDashboardService = new OpsDashboardService();

  @RequestMapping("/list.do")
  public String list() {
    opsDashboardService.loadOverview();
    return "ops/list";
  }

  @RequestMapping(value = "/status.do", produces = "application/json")
  @ResponseBody
  public String status() {
    opsDashboardService.loadOverview();
    return "{\"status\":\"ok\"}";
  }

  @RequestMapping("/export.do")
  public void export(HttpServletResponse response) throws Exception {
    response.setContentType("application/vnd.ms-excel");
    response.setHeader("Content-Disposition", "attachment; filename=ops-dashboard.xls");
    opsDashboardService.exportOverview();
    response.getOutputStream().write(new byte[0]);
    response.getOutputStream().flush();
  }
}
