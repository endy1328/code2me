package com.example.legacy.api;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import com.example.legacy.lib.ApiService;

@Controller
@RequestMapping("/api")
public class ApiController {
  private final ApiService apiService = new ApiService();

  @RequestMapping("/status")
  @ResponseBody
  public String status() {
    apiService.load();
    return "{\"status\":\"ok\"}";
  }
}
